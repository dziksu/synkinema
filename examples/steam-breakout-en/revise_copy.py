"""Apply the reviewed opening and comment CTA to revision 4, then export revision 5.

Uses the two locally transcribed Supertonic takes in out/revision-5-*.json.
Refuses to overwrite a newer edit; previous exports and media remain available.
"""

import copy
import json
import shutil
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
PID = "21f98d7acf244fb6b3f1c83fafe19159"
TAKES = {
    "hook-b": {
        "clip_id": "voice-004",
        "text": "Check out these games.",
        "start_ms": 1480,
        "source_in_ms": 250,
        "duration_ms": 1350,
        "speed": 1.0,
        "gain_db": 2.7,
    },
    "outro-b": {
        "clip_id": "voice-033",
        "text": "Which one wins? Tell me in the comments.",
        "start_ms": 24550,
        "source_in_ms": 330,
        "duration_ms": 2305,
        "speed": 1.05,
        "gain_db": 3.2,
    },
}


def main():
    state = json.loads((ROOT / "out/manifest.json").read_text())
    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as client:

        def call(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()

        project = call("GET", f"/api/projects/{PID}")
        assert project["revision"] == 4, "Project changed; review the new revision before editing."
        archive = ROOT / "out/revision-4"
        archive.mkdir(exist_ok=True)
        for name in [
            "manifest.json",
            "project.json",
            "final-job.json",
            "final-audio.json",
            "final-contact-sheet.jpg",
            "english-captions.srt",
            "all-text.srt",
            "next-up-steam-final.mp4",
        ]:
            source = ROOT / "out" / name
            if source.exists() and not (archive / name).exists():
                shutil.copy2(source, archive / name)
        (archive / "project.json").write_text(json.dumps(project, indent=2))
        operations = []

        def update(track, clip, changes):
            operations.append(
                {
                    "type": "update_clip",
                    "payload": {
                        "track_id": track,
                        "clip_id": clip,
                        "changes": changes,
                    },
                }
            )

        for key, take in TAKES.items():
            result = json.loads((ROOT / "out" / f"revision-5-{key}.json").read_text())
            assert result["text"] == take["text"]
            asset = result["asset"]
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/metadata",
                json={
                    "expected_version": asset["version"],
                    "name": f"VO • {key} • revised copy.wav",
                    "tags": asset["tags"] + ["steam-breakout-en", key, "revised-copy"],
                    "source": asset["source"],
                    "license": asset["license"],
                },
            )
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/location",
                json={
                    "project_id": PID,
                    "folder_id": state["folders"]["English voiceover"],
                },
            )
            assert take["source_in_ms"] + take["duration_ms"] * take["speed"] <= asset["duration_ms"]
            changes = {k: v for k, v in take.items() if k not in {"clip_id", "text"}}
            changes.update(asset_id=asset["id"], name=take["text"], fade_in_ms=12, fade_out_ms=25)
            update("voice", take["clip_id"], changes)
            state["takes"][key] = {
                "text": take["text"],
                "asset": asset,
                "source_in_ms": take["source_in_ms"],
                "duration_ms": round(take["duration_ms"] * take["speed"]),
                "raw_duration_ms": asset["duration_ms"],
                "timeline_start_ms": take["start_ms"],
                "timeline_duration_ms": take["duration_ms"],
                "speed": take["speed"],
            }

        for clip, text, start, end in [
            ("text-005", "CHECK OUT THESE GAMES.", 1580, 2950),
            ("text-034", "WHICH ONE WINS?", 24666, 25800),
            ("text-035", "TELL ME IN\nTHE COMMENTS.", 25800, 27000),
        ]:
            update(
                "titles",
                clip,
                {
                    "name": text.replace("\n", " "),
                    "text": text,
                    "start_ms": start,
                    "duration_ms": end - start,
                },
            )
        replacements = {
            "Try these three.": TAKES["hook-b"]["text"],
            "Which one are you playing first?": TAKES["outro-b"]["text"],
        }
        script = project["script"]
        scenes = copy.deepcopy(project["scenes"])
        for old, new in replacements.items():
            assert script.count(old) == 1
            script = script.replace(old, new)
            for scene in scenes:
                scene["narration"] = scene["narration"].replace(old, new)
        operations.append({"type": "update_project", "payload": {"script": script, "scenes": scenes}})
        payload = {"expected_revision": project["revision"], "operations": operations, "dry_run": True}
        (ROOT / "out/revision-5-operations.json").write_text(json.dumps(payload, indent=2))
        draft = call("POST", f"/api/projects/{PID}/operations/batch", json=payload)
        assert draft["committed"] is False
        payload["dry_run"] = False
        call("POST", f"/api/projects/{PID}/operations/batch", json=payload)
        state["project"] = call("GET", f"/api/projects/{PID}")
        assert state["project"]["revision"] == 5
        state["preflight"] = call("GET", f"/api/projects/{PID}/preflight")
        assert state["preflight"]["valid"], state["preflight"]
        (ROOT / "out/manifest.json").write_text(json.dumps(state, ensure_ascii=False, indent=2))
        (ROOT / "out/project.json").write_text(json.dumps(state["project"], ensure_ascii=False, indent=2))
        job = call("POST", f"/api/projects/{PID}/renders", json={"expected_revision": 5, "quality": "final"})
        (ROOT / "out/final-job.json").write_text(json.dumps(job, indent=2))
        print(json.dumps({"revision": 5, "preflight": state["preflight"], "job": job["id"]}), flush=True)


if __name__ == "__main__":
    main()
