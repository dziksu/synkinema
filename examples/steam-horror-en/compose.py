"""Compose a 43-second editable horror showcase with real source cuts and aligned captions."""

import json
import math
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
FPS = 30
SECTIONS = [
    ("hook", 0, 3000),
    ("cabin", 3000, 14500),
    ("ward", 14500, 26500),
    ("halloween", 26500, 38000),
    ("outro", 38000, 43000),
]
COLORS = {
    "hook": "#FFA982",
    "cabin": "#D8FB76",
    "ward": "#A5D8CF",
    "halloween": "#FFA982",
    "outro": "#FFA982",
}
GROUPS = {
    "hook": ["Three new horrors.", "Don't play these alone."],
    "cabin": [
        "In The Cabin Game,",
        "you and your friends",
        "are trapped inside a cabin.",
        "Play cards to find the exit,",
        "while your choices",
        "reshape the rooms",
        "and unleash monsters.",
    ],
    "ward": [
        "In The Forgotten Ward,",
        "you wake up",
        "in an abandoned",
        "psychiatric ward",
        "with no memory.",
        "Search patient files,",
        "solve puzzles,",
        "and flee the things",
        "stalking you.",
        "You cannot fight back.",
    ],
    "halloween": [
        "In Halloween,",
        "you become Michael Myers,",
        "or a Haddonfield defender.",
        "Stalk your victims,",
        "or grab household weapons",
        "and rescue families",
        "before the killer finds you.",
    ],
    "outro": ["Which one would make", "you quit first?", "Tell me in the comments."],
}


def frame(ms):
    return round(round(ms * FPS / 1000) * 1000 / FPS)


def score(path, seconds):
    rate = 48000
    n = round(seconds * rate)
    t = np.arange(n) / rate
    rng = np.random.default_rng(120920263)
    slow = 0.8 + 0.2 * np.sin(2 * np.pi * 0.13 * t)
    wave = 0.035 * (np.sin(2 * np.pi * 55 * t) + 0.25 * np.sin(2 * np.pi * 58.27 * t)) * slow
    for at in np.arange(0, seconds, 60 / 96):
        u = t - at
        mask = (u >= 0) & (u < 0.5)
        x = u[mask]
        wave[mask] += 0.17 * np.sin(2 * np.pi * (43 * x + 0.5 * (1 - np.exp(-30 * x)))) * np.exp(-13 * x)
    for _, at, _ in SECTIONS[1:]:
        center = at / 1000
        u = t - center
        mask = (u > -0.22) & (u < 0.6)
        x = u[mask]
        envelope = np.where(x < 0, np.exp(x * 16), np.exp(-x * 9))
        wave[mask] += 0.023 * rng.normal(size=x.size) * envelope
        wave[mask] += 0.08 * np.sin(2 * np.pi * (39 * x + 0.6 * np.exp(-np.maximum(x, 0) * 8))) * envelope
    envelope = np.minimum(1, t / 0.025) * np.minimum(1, (seconds - t) / 0.7)
    stereo = np.column_stack([wave, 0.98 * wave]) * envelope[:, None]
    sf.write(path, stereo, rate, subtype="PCM_16")


def main():
    state = json.loads((ROOT / "out/manifest.json").read_text())
    story = json.loads((ROOT / "script.json").read_text())
    alignment = json.loads((ROOT / "out/voice-alignment.json").read_text())
    pid = state["project"]["id"]
    tracks = []
    counter = 0

    def track(id, name, kind, **kw):
        x = {"id": id, "name": name, "kind": kind, "clips": [], **kw}
        tracks.append(x)
        return x["clips"]

    bg = track("atmosphere", "Atmosphere · softened gameplay", "video")
    hero = track("gameplay", "Gameplay · full source excerpts", "overlay")
    title = track("game-names", "Game titles & play modes", "text")
    identity = track("identity", "NEXT UP · horror edition", "text")
    feature = track("features", "Game mechanics & choices", "text")
    captions = track("captions", "English · aligned spoken captions", "text")
    disclosure = track("disclosure", "AI voice & editorial disclosure", "text")
    voice = track("narrator", "English narrator · local Supertonic M2", "voiceover")
    bed = track("original-score", "Original score · restrained horror pulse", "music", ducking=True)

    def uid(prefix):
        nonlocal counter
        counter += 1
        return f"{prefix}-{counter:03d}"

    def txt(
        target,
        text,
        start,
        end,
        *,
        size=64,
        y=0.755,
        style="boxed",
        color="#FFFFFF",
        subtitle="",
        fade=33,
        x=0.075,
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
                "text_x": x,
                "text_y": y,
                "caption_style": style,
                "color": color,
                "fade_in_ms": fade,
                "fade_out_ms": fade,
            }
        )

    def shot(target, key, source, start, end, ambient=False, full=False):
        correction = (
            [{"type": "brightness", "value": 0.07}, {"type": "contrast", "value": 1.04}]
            if key == "ward"
            else []
        )
        target.append(
            {
                "id": uid("shot"),
                "name": f"{key} · {source / 1000:g}s" + (" atmosphere" if ambient else ""),
                "asset_id": state["assets"][key]["id"],
                "source_in_ms": source,
                "start_ms": start,
                "duration_ms": end - start,
                "transform": {
                    "fit": "cover",
                    "scale": 1,
                    "x": 0.5,
                    "y": 0.5,
                    "opacity": 0.32 if ambient else (0.57 if full else 1),
                },
                "placement": {"x": 0.5, "y": 0.48, "width": 1, "height": 0.4}
                if target is hero
                else {"x": 0.5, "y": 0.5, "width": 1, "height": 1},
                "effects": (
                    [{"type": "blur", "value": 7}, {"type": "saturation", "value": 0.65}]
                    if ambient
                    else correction
                ),
            }
        )

    for key, start, end in SECTIONS:
        take = state["takes"][key]
        start_voice = start + (0 if key == "hook" else 100)
        length = math.floor(take["asset"]["duration_ms"] * 30 / 1000) * 1000 // 30
        assert start_voice + length <= end, (key, length)
        sample, _rate = sf.read(take["path"])
        rms = 20 * np.log10(max(1e-8, np.sqrt(np.mean(sample**2))))
        gain = round(float(np.clip(-20 - rms, -4, 8)), 2)
        voice.append(
            {
                "id": uid("voice"),
                "name": story[key],
                "asset_id": take["asset"]["id"],
                "start_ms": start_voice,
                "source_in_ms": 0,
                "duration_ms": length,
                "gain_db": gain,
                "fade_in_ms": 0,
                "fade_out_ms": 0,
            }
        )
        groups = GROUPS[key]
        assert " ".join(groups) == story[key]
        words = alignment[key]["aligned_script"]
        at_index = 0
        for i, text in enumerate(groups):
            caption_start = start_voice + frame(words[at_index]["start"] * 1000)
            at_index += len(text.split())
            caption_end = (
                start_voice + frame(words[at_index]["start"] * 1000)
                if at_index < len(words)
                else min(end, start_voice + frame(alignment[key]["speech_end"] * 1000 + 170))
            )
            if key == "hook" and i == 0:
                caption_start = 0
            if i == len(groups) - 1:
                caption_end = end
            txt(
                captions,
                text.upper(),
                caption_start,
                caption_end,
                color=COLORS[key],
                size=59 if len(text) > 27 else 65,
                fade=0,
            )
        take["timeline_start_ms"] = start_voice
        take["timeline_duration_ms"] = length
    for key, src, start, end in [
        ("halloween_gameplay", 20000, 0, 1000),
        ("ward", 39800, 1000, 2000),
        ("cabin", 104000, 2000, 3000),
    ]:
        shot(bg, key, src, start, end, full=True)
    txt(title, "DON'T PLAY\nTHESE ALONE.", 0, 3000, size=104, y=0.31, style="bold", fade=0)
    txt(feature, "3 NEW STEAM HORRORS", 0, 3000, size=41, y=0.575, style="bold", color=COLORS["hook"], fade=0)
    shots = {
        "cabin": [61000, 79000, 101000],
        "ward": [22000, 34000, 49000],
        "halloween": [38000, 74000, 82000],
    }
    labels = {
        "cabin": (
            "03 / THE CABIN GAME",
            "1–4 PLAYERS · EARLY ACCESS · AUG 27",
            "THE CARDS CHANGE EVERYTHING.",
            77,
        ),
        "ward": (
            "02 / ASHES OF THE DAMNED\nTHE FORGOTTEN WARD",
            "SINGLE-PLAYER · OUT AUG 19",
            "NO MEMORY. NO WAY TO FIGHT BACK.",
            51,
        ),
        "halloween": (
            "01 / HALLOWEEN:\nTHE GAME",
            "MULTIPLAYER + SOLO · OUT SEP 8",
            "BECOME THE THREAT. OR FACE IT.",
            74,
        ),
    }
    for key, start, end in SECTIONS[1:4]:
        times = [start, start + frame((end - start) / 3), start + frame((end - start) * 2 / 3), end]
        source_key = "halloween_gameplay" if key == "halloween" else key
        for i, src in enumerate(shots[key]):
            shot(bg, source_key, src, times[i], times[i + 1], ambient=True)
            shot(hero, source_key, src, times[i], times[i + 1])
        heading, mode, tagline, size = labels[key]
        txt(
            title,
            heading,
            start,
            end,
            size=size,
            y=0.16,
            style="editorial",
            color=COLORS[key],
            subtitle=mode,
            fade=67,
        )
        txt(feature, tagline, start, end, size=30, y=0.7, style="bold", color=COLORS[key], fade=67)
    txt(title, "WHICH ONE\nBREAKS YOU FIRST?", 38000, 43000, size=86, y=0.155, style="bold", fade=67)
    for key, source_key, src, start, end, name in [
        ("cabin", "cabin", 104000, 38000, 39667, "THE CABIN GAME"),
        ("ward", "ward", 39000, 39667, 41333, "THE FORGOTTEN WARD"),
        ("halloween", "halloween_gameplay", 52000, 41333, 43000, "HALLOWEEN: THE GAME"),
    ]:
        shot(bg, source_key, src, start, end, ambient=True)
        shot(hero, source_key, src, start, end)
        txt(feature, name, start, end, size=33, y=0.7, style="bold", color=COLORS[key], fade=0)
    txt(identity, "NEXT UP  /  AFTER DARK", 0, 43000, size=27, y=0.105, style="minimal", fade=0)
    txt(
        disclosure, "AI-GENERATED VOICE • EDITORIAL PICKS", 0, 43000, size=27, y=0.85, style="minimal", fade=0
    )
    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as api:

        def call(method, path, **kwargs):
            r = api.request(method, path, **kwargs)
            if r.is_error:
                raise RuntimeError(f"{r.status_code}: {r.text}")
            return r.json()

        if "music" not in state["assets"]:
            path = ROOT / "assets/original-after-dark.wav"
            score(path, 43)
            with path.open("rb") as audio:
                state["assets"]["music"] = call(
                    "POST",
                    "/api/assets",
                    files={"file": ("AFTER DARK · Original horror pulse.wav", audio, "audio/wav")},
                    data={
                        "project_id": pid,
                        "folder_id": state["folders"]["Original horror score"],
                        "tags": '["original","music","horror","steam-horror-en"]',
                        "source": "Original procedural score and transition accents; compose.py; seed120920263;96BPM",
                        "license": "Original generated audio for this project; no third-party samples.",
                    },
                )
            (ROOT / "out/manifest.json").write_text(json.dumps(state, ensure_ascii=False, indent=2))
        bed.append(
            {
                "id": uid("score"),
                "name": "AFTER DARK · original pulse + accents",
                "asset_id": state["assets"]["music"]["id"],
                "start_ms": 0,
                "duration_ms": 43000,
                "gain_db": -8,
                "fade_in_ms": 20,
                "fade_out_ms": 700,
            }
        )
        p = call("GET", f"/api/projects/{pid}")
        assert not any(t["clips"] for t in p["tracks"]), "Refusing to overwrite an existing composition."
        scenes = [
            {
                "id": key,
                "title": key.title(),
                "start_ms": start,
                "duration_ms": end - start,
                "narration": story[key],
                "voice_asset_id": state["takes"][key]["asset"]["id"],
                "notes": "Official trailer gameplay excerpts. Source status checked12September2026. Editable phrase captions aligned against actual local TTS.",
            }
            for key, start, end in SECTIONS
        ]
        operations = (
            [{"type": "remove_track", "payload": {"track_id": t["id"]}} for t in p["tracks"]]
            + [{"type": "add_track", "payload": t} for t in tracks]
            + [
                {
                    "type": "update_project",
                    "payload": {"scenes": scenes, "script": "\n\n".join(story.values())},
                }
            ]
        )
        batch = {"expected_revision": p["revision"], "operations": operations, "dry_run": True}
        preview = call("POST", f"/api/projects/{pid}/operations/batch", json=batch)
        assert not preview["committed"]
        p = call("POST", f"/api/projects/{pid}/operations/batch", json={**batch, "dry_run": False})["project"]
        preflight = call("GET", f"/api/projects/{pid}/preflight")
        assert preflight["valid"], preflight
        state.update(
            project=p,
            sections=[{"key": key, "start_ms": start, "end_ms": end} for key, start, end in SECTIONS],
            duration_ms=43000,
            preflight=preflight,
        )
        (ROOT / "out/manifest.json").write_text(json.dumps(state, ensure_ascii=False, indent=2))
        (ROOT / "out/project.json").write_text(json.dumps(p, ensure_ascii=False, indent=2))
        job = call(
            "POST",
            f"/api/projects/{pid}/renders",
            json={"expected_revision": p["revision"], "quality": "preview"},
        )
        (ROOT / "out/preview-job.json").write_text(json.dumps(job, indent=2))
        print(
            json.dumps(
                {
                    "project_id": pid,
                    "job_id": job["id"],
                    "duration_ms": 43000,
                    "tracks": len(tracks),
                    "clips": sum(len(t["clips"]) for t in tracks),
                    "preflight": preflight,
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
