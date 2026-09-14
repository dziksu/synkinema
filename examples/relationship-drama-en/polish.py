"""Improve subtitle sentence boundaries and hold a complete closing question, then export."""

import json
import math
from pathlib import Path

import httpx
from compose import frame

ROOT = Path(__file__).resolve().parent


def groups_for(words):
    sentences = []
    begin = 0
    for i, word in enumerate(words):
        if word["word"].endswith((".", "?", "!")) or i == len(words) - 1:
            sentences.append((begin, i + 1))
            begin = i + 1
    chunks = []
    for a, b in sentences:
        text = " ".join(w["word"] for w in words[a:b])
        count = max(math.ceil(len(text) / 55), math.ceil((b - a) / 10))
        if count == 1:
            if chunks and chunks[-1][2]:
                prev = chunks[-1][0]
                merged = " ".join(w["word"] for w in words[prev:b])
                if len(merged) <= 55 and b - prev <= 10:
                    chunks[-1] = (prev, b, True)
                    continue
            chunks.append((a, b, True))
        else:
            cursor = a
            for n in range(count):
                end = b if n == count - 1 else a + round((b - a) * (n + 1) / count)
                chunks.append((cursor, end, False))
                cursor = end
    return [(a, b) for a, b, _ in chunks]


def main():
    manifest = ROOT / "out/manifest.json"
    state = json.loads(manifest.read_text())
    align = json.loads((ROOT / "out/voice-alignment.json").read_text())
    pid = state["project"]["id"]
    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as api:

        def call(method, path, **kw):
            r = api.request(method, path, **kw)
            if r.is_error:
                raise RuntimeError(f"{r.status_code}: {r.text}")
            return r.json()

        p = call("GET", f"/api/projects/{pid}")
        assert p["revision"] == 2, "This revision-specific polish must only run once."
        old = next(t for t in p["tracks"] if t["id"] == "caption-text")
        clips = [old["clips"][0]]
        for section in state["sections"][1:]:
            key = section["id"]
            words = align[key]["aligned_script"]
            limit = len(words)
            cta = None
            if key == "ending":
                limit = next(i for i, w in enumerate(words) if w["word"] == "So")
                cta = section["start_ms"] + frame(words[limit]["start"] * 1000)
            groups = groups_for(words[:limit])
            for index, (a, b) in enumerate(groups):
                start = section["start_ms"] + frame(words[a]["start"] * 1000)
                end = (
                    section["start_ms"] + frame(words[groups[index + 1][0]]["start"] * 1000)
                    if index + 1 < len(groups)
                    else cta or section["start_ms"] + section["duration_ms"]
                )
                text = " ".join(w["word"] for w in words[a:b])
                clips.append(
                    {
                        "id": f"caption-polished-{len(clips):03}",
                        "name": text,
                        "text": text,
                        "start_ms": start,
                        "duration_ms": end - start,
                        "font_size": 68,
                        "text_x": 0.09,
                        "text_y": 0.44,
                        "color": "#FFD3BE"
                        if key in ["contact", "ring"]
                        else "#D8F4E4"
                        if key == "ending"
                        else "#F8F5F0",
                        "caption_style": "boxed",
                        "fade_in_ms": 35,
                        "fade_out_ms": 35,
                    }
                )
            if cta is not None:
                clips.append(
                    {
                        "id": "closing-question",
                        "name": "Tell the wedding guests, or cancel quietly?",
                        "text": "Tell the wedding guests,\nor cancel quietly?",
                        "start_ms": cta,
                        "duration_ms": state["duration_ms"] - cta,
                        "font_size": 78,
                        "text_x": 0.09,
                        "text_y": 0.40,
                        "color": "#D8F4E4",
                        "caption_style": "boxed",
                        "fade_in_ms": 80,
                        "fade_out_ms": 140,
                    }
                )
        new = {
            "id": "caption-text-polished",
            "name": "English captions · sentence aligned",
            "kind": "text",
            "clips": clips,
        }
        ops = [
            {"type": "remove_clip", "payload": {"track_id": old["id"], "clip_id": c["id"]}}
            for c in old["clips"]
        ]
        ops += [
            {"type": "remove_track", "payload": {"track_id": old["id"]}},
            {"type": "add_track", "payload": new},
            {
                "type": "reorder_tracks",
                "payload": {
                    "track_ids": [new["id"] if t["id"] == old["id"] else t["id"] for t in p["tracks"]]
                },
            },
        ]
        request = {"expected_revision": p["revision"], "operations": ops, "dry_run": True}
        call("POST", f"/api/projects/{pid}/operations/batch", json=request)
        p = call("POST", f"/api/projects/{pid}/operations/batch", json={**request, "dry_run": False})[
            "project"
        ]
        preflight = call("GET", f"/api/projects/{pid}/preflight")
        assert preflight["valid"], preflight
        state.update(project=p, preflight=preflight)
        manifest.write_text(json.dumps(state, indent=2, ensure_ascii=False))
        (ROOT / "out/project.json").write_text(json.dumps(p, indent=2, ensure_ascii=False))
        job = call(
            "POST",
            f"/api/projects/{pid}/renders",
            json={
                "expected_revision": p["revision"],
                "quality": "final",
                "output": {
                    "width": 1080,
                    "height": 1920,
                    "fps": 30,
                    "crf": 18,
                    "fit": "contain",
                    "background": "#080e10",
                    "x": 0.5,
                    "y": 0.5,
                },
            },
        )
        (ROOT / "out/final-job.json").write_text(json.dumps(job, indent=2))
        print(
            json.dumps(
                {
                    "job_id": job["id"],
                    "revision": p["revision"],
                    "caption_clips": len(clips),
                    "closing_question_ms": next(
                        c["duration_ms"] for c in clips if c["id"] == "closing-question"
                    ),
                    "preflight": preflight,
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
