"""Build an editable 9:16 Steam reel through the project's public API."""

import argparse
import json
import math
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
FPS = 30
SPEED = 0.88
COLORS = {
    "hook": "#D8FB76",
    "allumeria": "#99E8AC",
    "wheelmates": "#80D9FF",
    "wanderburg": "#FFD184",
    "outro": "#D8FB76",
}
GROUPS = {
    "hook-a": ["Still wondering", "what to play?"],
    "hook-b": ["Try these three."],
    "allumeria-a": ["In Allumeria,", "you and your friends", "explore a blocky world."],
    "allumeria-b": ["Build your own base,", "and take on bosses", "together."],
    "wheelmates-a": ["In WheelMates,", "you and a friend", "become tiny RC cars."],
    "wheelmates-b": ["Solve puzzles together,", "in a scientist's", "oversized house."],
    "wanderburg-a": ["In Wanderburg,", "you command a castle", "on wheels."],
    "wanderburg-b": ["Devour villages,", "stack ridiculous weapons,", "and become a rolling nightmare."],
    "outro-a": ["Three new Steam games", "I think could blow up."],
    "outro-b": ["Which one are you", "playing first?"],
}


def frame(ms):
    return round(ms * FPS / 1000) * 1000 // FPS


def music(path, seconds):
    sr = 48000
    n = round(seconds * sr)
    mix = np.zeros((n, 2))
    rng = np.random.default_rng(12092026)
    beat = 60 / 124
    notes = [146.83, 130.81, 174.61, 110.0]

    def put(t, sound, pan=0):
        start = round(t * sr)
        end = min(n, start + len(sound))
        sound = sound[: end - start]
        if end > start:
            mix[start:end] += (
                sound[:, None] * np.array([math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)])[None, :]
            )

    for i in range(math.ceil(seconds / beat)):
        start = i * beat
        t = np.arange(round(0.35 * sr)) / sr
        kick = 0.25 * np.sin(2 * np.pi * (48 * t + 1.3 * (1 - np.exp(-t * 35)))) * np.exp(-t * 16)
        put(start, kick)
        if i % 2:
            snap = 0.06 * rng.normal(size=len(t)) * np.exp(-t * 32)
            put(start, snap)
        for h in [0, 0.5]:
            ht = np.arange(round(0.075 * sr)) / sr
            noise = rng.normal(size=len(ht))
            noise = np.r_[0, np.diff(noise)]
            put(start + h * beat, 0.014 * noise * np.exp(-ht * 50), 0.35 if h else -0.35)
        freq = notes[(i // 8) % 4] / 2
        env = (1 - np.exp(-t * 120)) * np.exp(-t * 8)
        bass = 0.14 * (np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(4 * np.pi * freq * t)) * env
        put(start + 0.06, bass)
        for j in range(2):
            pt = np.arange(round(0.4 * sr)) / sr
            freq = notes[(i // 8) % 4] * [2, 3, 4, 3][(i * 2 + j) % 4]
            pluck = (
                0.046
                * (np.sin(2 * np.pi * freq * pt) + 0.2 * np.sin(4 * np.pi * freq * pt))
                * np.exp(-pt * 11)
                * (1 - np.exp(-pt * 180))
            )
            put(start + j * beat / 2, pluck, (-1 if j else 1) * 0.3)
    timeline = np.arange(n) / sr
    mix *= np.minimum(1, timeline / 0.08)[:, None] * np.minimum(1, (seconds - timeline) / 0.8)[:, None]
    sf.write(path, mix, sr, subtype="PCM_16")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quality", choices=["preview", "final"], default="preview")
    args = parser.parse_args()
    state = json.loads((ROOT / "out/manifest.json").read_text())
    pid = state["project"]["id"]
    takes = state["takes"]
    tracks = []

    def track(id, name, kind, **kw):
        value = {"id": id, "name": name, "kind": kind, "clips": [], **kw}
        tracks.append(value)
        return value["clips"]

    background = track("video", "Atmosphere · blurred gameplay", "video")
    hero = track("hero", "Gameplay · source shots", "overlay")
    endcards = [
        track(f"end-{i}", f"Final choice · {key}", "overlay")
        for i, key in enumerate(["allumeria", "wheelmates", "wanderburg"])
    ]
    headlines = track("headlines", "Game names & ranking", "text")
    identity = track("identity", "Series & status labels", "text")
    features = track("features", "Play modes & features", "text")
    captions = track("titles", "English captions", "text")
    disclosure = track("disclosure", "AI voice disclosure", "text")
    voice = track("voice", "English narrator · Supertonic M2", "voiceover")
    bed = track("music", "Original music · 124 BPM", "music", ducking=True)
    sfx = track("sound", "Transitions & accents · CC0", "sound")
    counter = 0

    def uid(prefix):
        nonlocal counter
        counter += 1
        return f"{prefix}-{counter:03d}"

    def text_clip(
        target,
        text,
        start,
        end,
        *,
        size=70,
        y=0.71,
        style="boxed",
        color="#FFFFFF",
        subtitle="",
        fade=60,
        x=0.09,
    ):
        target.append(
            {
                "id": uid("text"),
                "name": text.replace("\n", " "),
                "text": text,
                "subtitle": subtitle,
                "start_ms": start,
                "duration_ms": end - start,
                "font_size": size,
                "text_y": y,
                "text_x": x,
                "caption_style": style,
                "color": color,
                "fade_in_ms": min(fade, end - start),
                "fade_out_ms": min(fade, end - start),
            }
        )

    def picture(target, key, source, start, end, *, blur=False, full=False):
        duration = end - start
        target.append(
            {
                "id": uid("shot"),
                "name": f"{key.title()} · {source / 1000:g}s" + (" atmosphere" if blur else ""),
                "asset_id": state["assets"][key]["id"],
                "source_in_ms": source,
                "start_ms": start,
                "duration_ms": duration,
                "transform": {
                    "fit": "cover",
                    "scale": 1.02 if blur else 1,
                    "x": 0.5,
                    "y": 0.5,
                    "opacity": 0.44 if blur else 1,
                },
                "placement": {"x": 0.5, "y": 0.47, "width": 1, "height": 0.34}
                if target is hero and not full
                else {"x": 0.5, "y": 0.5, "width": 1, "height": 1},
                "effects": [{"type": "blur", "value": 13}, {"type": "saturation", "value": 0.7}]
                if blur
                else [],
                "animations": []
                if blur
                else [
                    {
                        "property": "scale",
                        "keyframes": [
                            {"time_ms": 0, "value": 1.06, "easing": "linear"},
                            {"time_ms": min(220, duration), "value": 1, "easing": "ease_out"},
                            {"time_ms": duration, "value": 1.025, "easing": "linear"},
                        ],
                    }
                ],
            }
        )

    sections = []
    cursor = 0
    for key, minimum in [
        ("hook", 3000),
        ("allumeria", 6000),
        ("wheelmates", 6500),
        ("wanderburg", 7000),
        ("outro", 4500),
    ]:
        start = cursor
        t = start + 150
        for part in ["a", "b"]:
            take = takes[f"{key}-{part}"]
            length = frame(take["duration_ms"] / SPEED)
            # Floor to a frame so source bounds never overrun after rate conversion.
            if length * SPEED > take["duration_ms"]:
                length -= 34
            sample, sr = sf.read(ROOT / "assets" / f"voice-{key}-{part}.wav")
            a = round(take["source_in_ms"] / 1000 * sr)
            b = round((take["source_in_ms"] + take["duration_ms"]) / 1000 * sr)
            rms = 20 * np.log10(max(1e-8, np.sqrt(np.mean(sample[a:b] ** 2))))
            gain = round(float(np.clip(-20 - rms, -3, 10)), 2)
            voice.append(
                {
                    "id": uid("voice"),
                    "name": take["text"],
                    "asset_id": take["asset"]["id"],
                    "start_ms": t,
                    "source_in_ms": take["source_in_ms"],
                    "duration_ms": length,
                    "speed": SPEED,
                    "gain_db": gain,
                    "fade_in_ms": 12,
                    "fade_out_ms": 25,
                }
            )
            groups = GROUPS[f"{key}-{part}"]
            weights = [len(g.replace("RC", "R C")) for g in groups]
            weight = sum(weights)
            at = t
            for index, g in enumerate(groups):
                end = (
                    t + length
                    if index == len(groups) - 1
                    else t + frame(length * sum(weights[: index + 1]) / weight)
                )
                text_clip(
                    captions, g.upper(), at, end, size=68 if len(g) < 27 else 61, color=COLORS[key], fade=35
                )
                at = end
            take["timeline_start_ms"] = t
            take["timeline_duration_ms"] = length
            t += length + 120
        end = start + max(minimum, frame(t - start + 200))
        sections.append({"key": key, "start_ms": start, "end_ms": end, "duration_ms": end - start})
        cursor = end
    duration = cursor
    captions[-1]["duration_ms"] = duration - captions[-1]["start_ms"]
    # Three rapid opening flashes followed by a readable landscape gameplay window.
    for key, src, start, end in [
        ("wanderburg", 41000, 0, 1000),
        ("wheelmates", 28000, 1000, 2000),
        ("allumeria", 3000, 2000, 3000),
    ]:
        picture(background, key, src, start, end, full=True)
        background[-1]["transform"]["opacity"] = 0.58
    text_clip(
        headlines, "WHAT TO\nPLAY NEXT?", 0, 3000, size=118, y=0.34, style="bold", color="#FFFFFF", fade=0
    )
    text_clip(
        features, "3 NEW STEAM PICKS", 0, 3000, size=47, y=0.605, style="bold", color=COLORS["hook"], fade=0
    )
    sources = {
        "allumeria": [2000, 17000, 46500],
        "wheelmates": [4000, 21500, 28000],
        "wanderburg": [11500, 24000, 41000],
    }
    labels = {
        "allumeria": ("03 / ALLUMERIA", "ONLINE CO-OP  ·  EARLY ACCESS", "BUILD. EXPLORE. BOSS FIGHTS."),
        "wheelmates": ("02 / WHEELMATES", "TWO-PLAYER CO-OP", "ONE FRIEND. TWO TINY CARS."),
        "wanderburg": ("01 / WANDERBURG", "SOLO ROGUELIKE  ·  EARLY ACCESS", "YOUR CASTLE IS THE WEAPON."),
    }
    for section in sections[1:4]:
        key = section["key"]
        start = section["start_ms"]
        end = section["end_ms"]
        span = end - start
        cuts = [start, start + frame(span / 3), start + frame(span * 2 / 3), end]
        for i, src in enumerate(sources[key]):
            picture(background, key, src, cuts[i], cuts[i + 1], blur=True)
            picture(hero, key, src, cuts[i], cuts[i + 1])
        title, mode, feature = labels[key]
        text_clip(
            headlines,
            title,
            start,
            end,
            size=74 if key == "wanderburg" else 83,
            y=0.165,
            style="editorial",
            color=COLORS[key],
            subtitle=mode,
            fade=80,
        )
        text_clip(features, feature, start, end, size=30, y=0.66, style="bold", color=COLORS[key], fade=80)
    outro = sections[-1]
    start = outro["start_ms"]
    end = outro["end_ms"]
    picture(background, "wanderburg", 36000, start, end, blur=True)
    text_clip(
        headlines,
        "YOUR NEXT\nOBSESSION?",
        start,
        end,
        size=86,
        y=0.155,
        style="bold",
        color="#FFFFFF",
        fade=80,
    )
    for i, (key, src) in enumerate([("allumeria", 32000), ("wheelmates", 34000), ("wanderburg", 41000)]):
        picture(endcards[i], key, src, start, end)
        endcards[i][-1]["placement"] = {"x": 0.5, "y": 0.35 + i * 0.135, "width": 0.92, "height": 0.118}
        # Wide strips keep the footage recognizable beneath the labels.
        text_clip(
            features,
            key.upper(),
            start,
            end,
            size=33,
            y=0.326 + i * 0.135,
            style="boxed",
            color="#FFFFFF",
            fade=80,
        )
    # Each simultaneously visible closing label needs its own text lane.
    closing = [c for c in features if c["start_ms"] == start]
    features[:] = [c for c in features if c["start_ms"] != start]
    for i, c in enumerate(closing):
        track(f"choice-{i}", f"Choice label {i + 1}", "text").append(c)
    text_clip(
        identity, "NEXT UP  /  THE BREAKOUT WATCH", 0, duration, size=26, y=0.105, style="minimal", fade=0
    )
    text_clip(
        disclosure,
        "AI-GENERATED VOICE • EDITORIAL PICKS",
        0,
        duration,
        size=28,
        y=0.845,
        style="minimal",
        fade=0,
    )
    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as c:

        def call(method, path, **kwargs):
            r = c.request(method, path, **kwargs)
            if r.is_error:
                raise RuntimeError(f"{r.status_code}: {r.text}")
            return r.json()

        music_path = ROOT / "assets/original-next-up.wav"
        if "music" not in state["assets"]:
            music(music_path, duration / 1000)
            with music_path.open("rb") as audio:
                state["assets"]["music"] = call(
                    "POST",
                    "/api/assets",
                    files={"file": ("NEXT UP • Original 124 BPM.wav", audio, "audio/wav")},
                    data={
                        "project_id": pid,
                        "folder_id": state["folders"]["Music and accents"],
                        "tags": '["music","original","steam-breakout-en"]',
                        "source": "Original procedural instrumental; compose.py; seed 12092026; 124 BPM",
                        "license": "Original generated instrumental for this Synkinema project; no third-party samples.",
                    },
                )
        bed.append(
            {
                "id": uid("music"),
                "name": "NEXT UP · original groove",
                "asset_id": state["assets"]["music"]["id"],
                "start_ms": 0,
                "duration_ms": duration,
                "gain_db": -10,
                "fade_in_ms": 80,
                "fade_out_ms": 600,
            }
        )
        library = call("GET", "/api/assets")

        def find(tag):
            return next(
                a for a in library if tag in a["tags"] and "CC0" in a["tags"] and a["duration_ms"] >= 100
            )

        impact = find("punch")
        whoosh = find("whoosh")
        confirm = find("confirmation")
        for t, asset, gain in (
            [(0, impact, -12)]
            + [(s["start_ms"] - 100, whoosh, -14) for s in sections[1:]]
            + [(duration - 650, confirm, -14)]
        ):
            sfx.append(
                {
                    "id": uid("sfx"),
                    "name": asset["name"],
                    "asset_id": asset["id"],
                    "start_ms": t,
                    "duration_ms": min(asset["duration_ms"], duration - t),
                    "gain_db": gain,
                    "fade_out_ms": 40,
                }
            )
        p = call("GET", f"/api/projects/{pid}")
        scenes = [
            {
                "id": s["key"],
                "title": s["key"].title(),
                "start_ms": s["start_ms"],
                "duration_ms": s["duration_ms"],
                "narration": " ".join(takes[f"{s['key']}-{part}"]["text"] for part in ["a", "b"]),
                "notes": "Official trailer excerpts. Editable layers. Ranking is editorial opinion.",
            }
            for s in sections
        ]
        assert not any(t["clips"] for t in p["tracks"]), (
            "Composition exists; use explicit clip operations to revise it."
        )
        operations = [{"type": "remove_track", "payload": {"track_id": t["id"]}} for t in p["tracks"]]
        operations += [{"type": "add_track", "payload": t} for t in tracks]
        operations += [
            {
                "type": "update_project",
                "payload": {"profile": {**p["profile"], "target_lufs": -18, "crf": 19}, "scenes": scenes},
            }
        ]
        batch = {"expected_revision": p["revision"], "operations": operations, "dry_run": True}
        preview = call("POST", f"/api/projects/{pid}/operations/batch", json=batch)
        assert not preview["committed"]
        p = call("POST", f"/api/projects/{pid}/operations/batch", json={**batch, "dry_run": False})["project"]
        preflight = call("GET", f"/api/projects/{pid}/preflight")
        assert preflight["valid"], preflight
        state.update(project=p, sections=sections, duration_ms=duration, preflight=preflight)
        (ROOT / "out/manifest.json").write_text(json.dumps(state, ensure_ascii=False, indent=2))
        (ROOT / "out/project.json").write_text(json.dumps(p, ensure_ascii=False, indent=2))
        job = call(
            "POST",
            f"/api/projects/{pid}/renders",
            json={"expected_revision": p["revision"], "quality": args.quality},
        )
        (ROOT / "out" / f"{args.quality}-job.json").write_text(json.dumps(job, indent=2))
        print(
            json.dumps(
                {
                    "project_id": pid,
                    "duration_ms": duration,
                    "tracks": len(tracks),
                    "clips": sum(len(t["clips"]) for t in tracks),
                    "sections": sections,
                    "job_id": job["id"],
                    "preflight": preflight,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
