"""Compose an editable, captioned drama through Synkinema's revisioned public API."""

import json
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
FPS = 30


def frame(ms):
    return round(ms * FPS / 1000) * 1000 // FPS


def score(path, seconds, reveal_second):
    """Original restrained ambient score and notification accents; no sampled music."""
    rate = 48000
    n = round(seconds * rate)
    t = np.arange(n, dtype=np.float64) / rate
    mix = np.zeros((n, 2), dtype=np.float64)
    # Slow minor harmony stays behind the narrator; texture opens after the reveal.
    for i, root in enumerate([110, 98, 87.307, 82.407]):
        period = seconds / 4
        center = (i + 0.5) * period
        env = np.clip(1 - np.abs(t - center) / (period * 0.74), 0, 1)
        for multiplier, amplitude, pan in [(1, 0.019, -0.2), (1.5, 0.011, 0.2), (2, 0.006, 0)]:
            tone = amplitude * env * np.sin(2 * np.pi * root * multiplier * t + 0.16 * np.sin(t * 0.65))
            mix += tone[:, None] * np.array([1 - pan, 1 + pan])[None, :]
    for at in np.arange(1.8, seconds - 5, 2.35):
        dt = t - at
        env = np.where(dt >= 0, np.exp(-np.maximum(0, dt) * 4.5), 0)
        sound = 0.009 * env * np.sin(2 * np.pi * 220 * t)
        mix += sound[:, None]
    for at, freq in [(0.12, 880), (reveal_second, 164.814)]:
        dt = t - at
        env = np.where(dt >= 0, np.exp(-np.maximum(0, dt) * 2.5), 0)
        sound = 0.04 * env * (np.sin(2 * np.pi * freq * dt) + 0.4 * np.sin(2 * np.pi * freq * 1.5 * dt))
        mix += sound[:, None]
    fade = np.minimum(1, t / 0.06) * np.minimum(1, (seconds - t) / 1.6)
    sf.write(path, mix * fade[:, None], rate, subtype="PCM_16")


def main():
    state = json.loads((ROOT / "out/manifest.json").read_text())
    story = json.loads((ROOT / "story.json").read_text())
    aligned = json.loads((ROOT / "out/voice-alignment.json").read_text())
    pid = state["project"]["id"]
    tracks = []

    def track(id, name, kind, **kw):
        value = {"id": id, "name": name, "kind": kind, "clips": [], **kw}
        tracks.append(value)
        return value["clips"]

    background = track("night-video", "Night footage · licensed source excerpts", "video")
    chapters = track("chapter-text", "Story chapters", "text")
    captions = track("caption-text", "English synchronized captions", "text")
    identity = track("series-text", "After Hours · series identity", "text")
    disclosure = track("disclosure-text", "Fiction & AI voice disclosure", "text")
    voice = track("narrator", "English narrator · local Supertonic F1", "voiceover")
    music = track("ambient-score", "Original ambient score & accents", "music", ducking=True)
    count = 0

    def uid(prefix):
        nonlocal count
        count += 1
        return f"{prefix}-{count:03}"

    def text(target, value, start, end, *, size=68, y=0.44, color="#F8F5F0", style="boxed", fade=40):
        if end - start < 100:
            return
        target.append(
            {
                "id": uid("text"),
                "name": value.replace("\n", " "),
                "text": value,
                "start_ms": start,
                "duration_ms": end - start,
                "font_size": size,
                "text_x": 0.09,
                "text_y": y,
                "color": color,
                "caption_style": style,
                "fade_in_ms": fade,
                "fade_out_ms": fade,
            }
        )

    sections = []
    cursor = 0
    for part in story["parts"]:
        key = part["id"]
        take = state["takes"][key]
        # Retain the entire generated recording: no word can be cut by a heuristic trim.
        length = take["asset"]["duration_ms"]
        span = frame(length + (750 if key in ["contact", "ring"] else 300))
        span = max(span, length + 100)
        start = cursor
        end = start + span
        samples, _rate = sf.read(take["path"])
        rms = 20 * np.log10(max(1e-8, float(np.sqrt(np.mean(samples * samples)))))
        gain = round(float(np.clip(-21 - rms, -3, 9)), 2)
        voice.append(
            {
                "id": uid("voice"),
                "name": take["text"],
                "asset_id": take["asset"]["id"],
                "start_ms": start,
                "source_in_ms": 0,
                "duration_ms": length,
                "gain_db": gain,
                "fade_in_ms": 0,
                "fade_out_ms": 15,
            }
        )
        sections.append(
            {
                "id": key,
                "title": part["chapter"],
                "narration": part["text"],
                "start_ms": start,
                "duration_ms": span,
                "voice_asset_id": take["asset"]["id"],
                "notes": "Original fiction. Background stock footage is illustrative; English AI narration.",
            }
        )
        if key == "hook":
            text(
                captions,
                "DON'T OPEN\nTHAT MESSAGE.",
                start,
                end,
                size=112,
                y=0.36,
                style="bold",
                color="#FFE2D7",
                fade=0,
            )
        else:
            words = aligned[key]["aligned_script"]
            groups = []
            at = 0
            while at < len(words):
                stop = at
                while stop < len(words):
                    candidate = " ".join(w["word"] for w in words[at : stop + 1])
                    if stop > at and (len(candidate) > 55 or stop - at >= 10):
                        break
                    stop += 1
                    if stop - at >= 4 and words[stop - 1]["word"].endswith((".", "?", "!")):
                        break
                groups.append((at, stop))
                at = stop
            for i, (a, b) in enumerate(groups):
                cstart = start + frame(words[a]["start"] * 1000)
                cend = start + (
                    frame(words[groups[i + 1][0]]["start"] * 1000) if i + 1 < len(groups) else span
                )
                value = " ".join(w["word"] for w in words[a:b])
                color = (
                    "#FFD3BE" if key in ["contact", "ring"] else ("#D8F4E4" if key == "ending" else "#F8F5F0")
                )
                text(captions, value, cstart, cend, color=color)
        text(
            chapters,
            part["chapter"],
            start,
            end,
            size=32,
            y=0.225,
            color="#E9B9A4" if key != "ending" else "#B7E5D0",
            style="minimal",
            fade=0,
        )
        cursor = end
    # Hold the completed final question briefly, keeping everything below five minutes.
    duration = frame(cursor + 1300)
    sections[-1]["duration_ms"] += duration - cursor
    captions[-1]["duration_ms"] += duration - cursor
    chapters[-1]["duration_ms"] += duration - cursor
    # Four actual downloaded sources, cut with varied offsets. Portrait sources preserve detail.
    # Rain is deliberately soft bokeh and only used in the opening/transition, never as fake UHD.
    choices = [
        "rain",
        "city",
        "traffic",
        "bokeh",
        "traffic",
        "city",
        "bokeh",
        "rain",
        "traffic",
        "city",
        "bokeh",
        "traffic",
        "city",
        "traffic",
        "bokeh",
        "city",
        "traffic",
        "city",
    ]
    cursor = 0
    for i, key in enumerate(choices):
        remaining = duration - cursor
        if remaining <= 0:
            break
        asset = state["assets"][key]
        length = min(remaining, [6500, 7500, 7200, 6500][i % 4])
        length = frame(length)
        if i == len(choices) - 1:
            length = remaining
        offset = min([500, 1200, 2600, 300][i % 4], max(0, asset["duration_ms"] - length - 100))
        assert length + offset <= asset["duration_ms"]
        background.append(
            {
                "id": uid("shot"),
                "name": f"{key.title()} · shot {i + 1:02}",
                "asset_id": asset["id"],
                "start_ms": cursor,
                "duration_ms": length,
                "source_in_ms": offset,
                "transform": {"fit": "cover", "scale": 1, "x": 0.5, "y": 0.5, "opacity": 1},
                "effects": [{"type": "brightness", "value": -0.12}, {"type": "saturation", "value": 0.72}],
                "fade_in_ms": 0,
                "fade_out_ms": 220 if cursor + length == duration else 0,
            }
        )
        cursor += length
    assert cursor == duration, (cursor, duration)
    text(
        identity,
        "AFTER HOURS  /  THE GIRL IN HIS PHONE",
        0,
        duration,
        size=26,
        y=0.12,
        style="minimal",
        color="#E9B9A4",
        fade=0,
    )
    text(
        disclosure,
        "FICTIONAL STORY  •  AI-GENERATED VOICE",
        0,
        duration,
        size=25,
        y=0.845,
        style="minimal",
        color="#D2D7DA",
        fade=0,
    )
    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as api:

        def call(method, path, **kw):
            r = api.request(method, path, **kw)
            if r.is_error:
                raise RuntimeError(f"{r.status_code}: {r.text}")
            return r.json()

        scorepath = ROOT / "assets/original-after-hours.wav"
        if "score" not in state["assets"]:
            reveal = next(s["start_ms"] / 1000 for s in sections if s["id"] == "reveal")
            score(scorepath, duration / 1000, reveal)
            with scorepath.open("rb") as stream:
                state["assets"]["score"] = call(
                    "POST",
                    "/api/assets",
                    files={"file": ("After Hours · original ambient score.wav", stream, "audio/wav")},
                    data={
                        "project_id": pid,
                        "folder_id": state["folders"]["Original sound design"],
                        "tags": '["original","ambient","music","relationship-drama-en"]',
                        "source": "Original procedural score created by compose.py: additive synthesis, no external samples.",
                        "license": "Original generated music for this project; no third-party samples.",
                    },
                )
            (ROOT / "out/manifest.json").write_text(json.dumps(state, indent=2))
        music.append(
            {
                "id": uid("score"),
                "name": "After Hours · original ambient score",
                "asset_id": state["assets"]["score"]["id"],
                "start_ms": 0,
                "duration_ms": duration,
                "gain_db": -7,
                "fade_in_ms": 0,
                "fade_out_ms": 1000,
            }
        )
        p = call("GET", f"/api/projects/{pid}")
        assert not any(t["clips"] for t in p["tracks"]), "Composition exists; do not overwrite silently."
        ops = [{"type": "remove_track", "payload": {"track_id": t["id"]}} for t in p["tracks"]]
        ops += [{"type": "add_track", "payload": t} for t in tracks]
        ops += [{"type": "update_project", "payload": {"scenes": sections}}]
        request = {"expected_revision": p["revision"], "operations": ops, "dry_run": True}
        call("POST", f"/api/projects/{pid}/operations/batch", json=request)
        result = call("POST", f"/api/projects/{pid}/operations/batch", json={**request, "dry_run": False})
        p = result["project"]
        preflight = call("GET", f"/api/projects/{pid}/preflight")
        assert preflight["valid"], preflight
        state.update(project=p, sections=sections, duration_ms=duration, preflight=preflight)
        (ROOT / "out/manifest.json").write_text(json.dumps(state, indent=2, ensure_ascii=False))
        (ROOT / "out/project.json").write_text(json.dumps(p, indent=2, ensure_ascii=False))
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
                    "revision": p["revision"],
                    "duration_ms": duration,
                    "clips": sum(len(t["clips"]) for t in tracks),
                    "tracks": len(tracks),
                    "job_id": job["id"],
                    "preflight": preflight,
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
