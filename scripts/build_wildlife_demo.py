"""Build the complete example through the public REST API; generates original audio locally."""

import argparse
import json
import math
import subprocess
import wave
from pathlib import Path

import httpx
import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "examples" / "polish-wildlife"
DURATION = 40000
NARRATION = [
    (300, "Znikają tuż obok nas. Poznaj trzy historie z Polski."),
    (
        5000,
        "Chomik europejski. Krytycznie zagrożony wyginięciem. Intensywne rolnictwo i zanik siedlisk odbierają mu dom.",
    ),
    (13500, "Wodniczka. Ten mały ptak potrzebuje mokradeł. Osuszanie zabiera mu miejsca do życia."),
    (
        22000,
        "Morświn. Populacja Bałtyku właściwego jest krytycznie zagrożona. Przyłów w sieciach i podwodny hałas to realne zagrożenia.",
    ),
    (
        32200,
        "Chrońmy mokradła, pola i morze. Wspieraj ochronę przyrody. Udostępnij ich historię. Zanim zapadnie cisza.",
    ),
]


def wav(path, data, rate=48000):
    stereo = np.column_stack([data, data]) if data.ndim == 1 else data
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes((np.clip(stereo, -1, 1) * 32767).astype("<i2").tobytes())


def audio():
    directory = ROOT / "assets"
    directory.mkdir(parents=True, exist_ok=True)
    for i, (_, words) in enumerate(NARRATION):
        path = directory / f"voice-{i}.wav"
        if path.exists():
            continue
        aiff = path.with_suffix(".aiff")
        # Demo fixture on macOS; the engine accepts imported WAV on every OS.
        subprocess.run(["say", "-v", "Zosia", "-r", "183", "-o", str(aiff), words], check=True)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-i",
                str(aiff),
                "-af",
                "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.1,areverse",
                "-ar",
                "48000",
                "-ac",
                "2",
                str(path),
            ],
            check=True,
        )
        aiff.unlink()
    rate = 48000
    t = np.arange(rate * 40) / rate
    music = np.zeros_like(t)
    rng = np.random.default_rng(420)
    # Original 120 BPM instrumental: restrained minor arpeggio, pulse, kick and hats.
    chords = [(146.83, 174.61, 220), (116.54, 146.83, 174.61), (130.81, 164.81, 196), (110, 130.81, 164.81)]
    for beat in range(80):
        start = beat * 0.5
        length = min(1.5, 40 - start)
        s = np.arange(round(length * rate)) / rate
        chord = chords[(beat // 8) % 4]
        freq = chord[beat % 3] * 2
        note = (
            0.047
            * (np.sin(2 * math.pi * freq * s) + 0.22 * np.sin(2 * math.pi * 2 * freq * s))
            * np.exp(-s * 4)
            * np.minimum(1, s * 100)
        )
        if beat % 2 == 0:
            note += 0.10 * np.sin(2 * math.pi * (48 * s + 7 * (1 - np.exp(-s * 35)))) * np.exp(-s * 16)
        note += 0.008 * rng.normal(size=len(s)) * np.exp(-s * 80)
        idx = round(start * rate)
        music[idx : idx + len(s)] += note
    for k in range(10):
        mask = (t >= k * 4) & (t < (k + 1) * 4)
        s = t[mask] - k * 4
        pad = sum(np.sin(2 * math.pi * f * s) for f in chords[k % 4]) * 0.012
        music[mask] += pad * np.minimum(1, s * 2) * np.minimum(1, (4 - s) * 2)
    music *= np.minimum(1, t / 1.2) * np.minimum(1, (40 - t) / 2)
    wav(directory / "music.wav", music)
    s = np.arange(round(0.65 * rate)) / rate
    noise = rng.normal(size=len(s))
    sweep = np.convolve(noise, np.ones(7) / 7, mode="same") * 0.13 * np.sin(math.pi * s / 0.65) ** 2
    wav(directory / "transition.wav", sweep)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8080")
    parser.add_argument("--quality", choices=["preview", "final"], default="preview")
    args = parser.parse_args()
    audio()
    client = httpx.Client(base_url=args.url, timeout=120)

    def post(path, **kwargs):
        r = client.post(path, **kwargs)
        if r.is_error:
            raise RuntimeError(f"{r.status_code}: {r.text}")
        return r.json()

    assets = {}
    credits = json.loads((ROOT / "assets.json").read_text())
    for item in credits:
        with (ROOT / "assets" / item["filename"]).open("rb") as file:
            assets[item["key"]] = post(
                "/api/assets",
                files={"file": (item["filename"], file)},
                data={
                    "tags": json.dumps(["Polska", "zagrożone gatunki", item["key"]]),
                    "source": item["source"],
                    "license": item["author"] + " · " + item["license"],
                },
            )
    for key in [f"voice-{i}" for i in range(len(NARRATION))] + ["music", "transition"]:
        with (ROOT / "assets" / f"{key}.wav").open("rb") as file:
            assets[key] = post(
                "/api/assets",
                files={"file": (f"{key}.wav", file)},
                data={
                    "tags": json.dumps(["Polska", "lektor" if key.startswith("voice") else "dźwięk"]),
                    "source": "Local macOS Zosia demo voice"
                    if key.startswith("voice")
                    else "Original procedural composition, scripts/build_wildlife_demo.py",
                    "license": "Local speech fixture" if key.startswith("voice") else "CC BY-SA 4.0",
                },
            )

    def keys(prop, a, b, duration):
        return {
            "property": prop,
            "keyframes": [
                {"time_ms": 0, "value": a},
                {"time_ms": duration, "value": b, "easing": "ease_in_out"},
            ],
        }

    def shot(key, start, length, z1=1, z2=1.12, x=0.5, y=0.5, transition="cut", overlap=0):
        return {
            "name": key,
            "asset_id": assets[key]["id"],
            "start_ms": start,
            "duration_ms": length,
            "transform": {"x": x, "y": y},
            "animations": [keys("scale", z1, z2, length)],
            "effects": [
                {"type": "saturation", "value": 0.9},
                {"type": "contrast", "value": 1.08},
                {"type": "vignette", "value": 0.38},
            ],
            "transition": {"type": transition, "duration_ms": overlap},
        }

    shots = [
        shot("hamster", 0, 1600, 1.02, 1.18, 0.08),
        shot("warbler", 1400, 1600, 1.5, 1.7, 0.4, 0.8, "zoom", 200),
        shot("porpoise", 2800, 2000, 1.1, 1.22, 0.5, 0.5, "wipe", 200),
        shot("hamster", 4500, 9000, 1.02, 1.16, 0.04, 0.5, "crossfade", 300),
        shot("warbler", 13200, 9000, 1.8, 2.1, 0.43, 0.82, "slide", 300),
        shot("porpoise", 21800, 10500, 1.04, 1.18, 0.52, 0.5, "blur", 400),
        shot("warbler", 32000, 8000, 1.1, 1.32, 0.45, 0.7, "crossfade", 300),
    ]

    def title(start, length, text, sub="", size=90, y=0.64, color="#d8fb76"):
        return {
            "name": text.replace("\n", " "),
            "start_ms": start,
            "duration_ms": length,
            "text": text,
            "subtitle": sub,
            "font_size": size,
            "text_y": y,
            "color": color,
            "fade_in_ms": 100,
            "fade_out_ms": 120,
        }

    titles = [
        title(150, 2600, "Znikają.", "TUŻ OBOK NAS.", 148, 0.59),
        title(2900, 1600, "3 historie.", "POLSKA • DZIKA PRZYRODA", 110, 0.65),
        title(4900, 4000, "Chomik\neuropejski", "01 / KRYTYCZNIE ZAGROŻONY GLOBALNIE", 92, 0.62),
        title(9100, 3700, "Traci swój dom.", "INTENSYWNE ROLNICTWO • ZANIK SIEDLISK", 91, 0.64),
        title(13700, 3700, "Wodniczka", "02 / GATUNEK NARAŻONY GLOBALNIE", 102, 0.18),
        title(17800, 3600, "Bez mokradeł\nnie przetrwa.", "OSUSZANIE ODBIERA JEJ SIEDLISKA", 86, 0.18),
        title(22300, 4200, "Morświn", "03 / BAŁTYK WŁAŚCIWY", 106, 0.63, color="#a2e1f3"),
        title(
            26900,
            4700,
            "Sieci. Hałas.\nCoraz mniej ciszy.",
            "KRYTYCZNIE ZAGROŻONA POPULACJA",
            83,
            0.60,
            color="#a2e1f3",
        ),
        title(32500, 3300, "Ich dom.\nNasza sprawa.", "CHROŃMY MOKRADŁA, POLA I MORZE.", 99, 0.2),
        title(36100, 3900, "Zanim zapadnie\ncisza.", "WSPIERAJ OCHRONĘ PRZYRODY. PODAJ DALEJ.", 94, 0.2),
    ]
    voice = []
    scenes = []
    for i, (start, words) in enumerate(NARRATION):
        duration = assets[f"voice-{i}"]["duration_ms"]
        if start + duration > DURATION:
            raise RuntimeError(f"Voice {i} exceeds timeline: {duration}")
        if i + 1 < len(NARRATION) and start + duration > NARRATION[i + 1][0]:
            raise RuntimeError(f"Voice {i} overlaps next voice")
        voice.append(
            {
                "name": f"Lektor {i + 1}",
                "asset_id": assets[f"voice-{i}"]["id"],
                "start_ms": start,
                "duration_ms": duration,
                "gain_db": 2,
                "fade_in_ms": 30,
                "fade_out_ms": 60,
            }
        )
        scenes.append(
            {
                "title": ["Otwarcie", "Chomik europejski", "Wodniczka", "Morświn", "Wezwanie do działania"][
                    i
                ],
                "narration": words,
                "start_ms": start,
                "duration_ms": duration,
                "voice_asset_id": assets[f"voice-{i}"]["id"],
            }
        )
    tracks = [
        {"id": "video", "name": "Obraz", "kind": "video", "clips": shots},
        {"id": "titles", "name": "Napisy", "kind": "text", "clips": titles},
        {"id": "voice", "name": "Lektor", "kind": "voiceover", "clips": voice},
        {
            "id": "music",
            "name": "Muzyka",
            "kind": "music",
            "ducking": True,
            "clips": [
                {
                    "name": "Original • Before the silence",
                    "asset_id": assets["music"]["id"],
                    "duration_ms": DURATION,
                    "gain_db": -2,
                    "fade_in_ms": 600,
                    "fade_out_ms": 1800,
                }
            ],
        },
        {
            "id": "sfx",
            "name": "Akcenty",
            "kind": "sound",
            "clips": [
                {
                    "name": "Przejście",
                    "asset_id": assets["transition"]["id"],
                    "start_ms": time,
                    "duration_ms": 650,
                    "gain_db": -9,
                }
                for time in [1200, 2600, 4200, 12900, 21500, 31700]
            ],
        },
    ]
    brief = "40-sekundowy reel edukacyjny, 9:16. Prawdziwe zdjęcia, polski lektor, oryginalna muzyka, dynamiczne przejścia. Źródła: WWF Polska i OTOP. Status morświna dotyczy populacji Bałtyku właściwego. Zdjęcie morświna pochodzi z ośrodka w Danii i ilustruje gatunek. Pełne autorstwo w CREDITS.md."
    project = {
        "name": "Zanim zapadnie cisza • Polska",
        "brief": brief,
        "script": "\n\n".join(words for _, words in NARRATION),
        "profile": {"width": 1080, "height": 1920, "fps": 30, "crf": 20},
        "scenes": scenes,
        "tracks": tracks,
        "asset_ids": [a["id"] for a in assets.values()],
    }
    (ROOT / "project.json").write_text(json.dumps(project, ensure_ascii=False, indent=2))
    result = post("/api/projects", json=project)
    job = post(
        f"/api/projects/{result['id']}/renders",
        json={"quality": args.quality, "expected_revision": result["revision"]},
    )
    (ROOT / "run.json").write_text(
        json.dumps({"project_id": result["id"], "job_id": job["id"], "quality": args.quality}, indent=2)
    )
    print(
        json.dumps(
            {
                "project_id": result["id"],
                "job_id": job["id"],
                "duration_ms": result["duration_ms"],
                "voice_durations": [c["duration_ms"] for c in voice],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
