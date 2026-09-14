"""Replace the final trailer title card with a checked Michael Myers shot, preserving all audio and timing."""

import copy
import json
import shutil
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
manifest = ROOT / "out/manifest.json"
state = json.loads(manifest.read_text())
pid = state["project"]["id"]
with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as api:

    def call(method, path, **kwargs):
        response = api.request(method, path, **kwargs)
        if response.is_error:
            raise RuntimeError(f"{response.status_code}: {response.text}")
        return response.json()

    project = call("GET", f"/api/projects/{pid}")
    assert project["revision"] == 3, "This narrowly scoped correction requires revision 3."
    for filename in ["next-up-horror-final.mp4", "final-job.json", "final-ffprobe.json", "project.json"]:
        source = ROOT / "out" / filename
        target = source.with_name(source.stem + "-r3-review" + source.suffix)
        assert not target.exists(), f"Archive exists: {target}; review state before rerunning."
        if source.exists():
            shutil.copy2(source, target)
    expected = copy.deepcopy(project["tracks"])
    operations = []
    for track in expected:
        if track["id"] not in ["gameplay", "atmosphere"]:
            continue
        clips = [clip for clip in track["clips"] if clip["start_ms"] == 41333]
        assert len(clips) == 1
        clip = clips[0]
        assert clip["duration_ms"] == 1667 and clip["source_in_ms"] == 52000
        assert clip["asset_id"] == state["assets"]["halloween_gameplay"]["id"]
        changes = {"source_in_ms": 20000, "name": clip["name"].replace("52s", "20s")}
        operations.append(
            {
                "type": "update_clip",
                "payload": {"track_id": track["id"], "clip_id": clip["id"], "changes": changes},
            }
        )
        clip.update(changes)
    assert len(operations) == 2
    request = {"expected_revision": project["revision"], "operations": operations, "dry_run": True}
    call("POST", f"/api/projects/{pid}/operations/batch", json=request)
    updated = call("POST", f"/api/projects/{pid}/operations/batch", json={**request, "dry_run": False})[
        "project"
    ]
    assert updated["tracks"] == expected, "Unexpected timeline change."
    assert (
        updated["profile"] == project["profile"]
        and updated["scenes"] == project["scenes"]
        and updated["script"] == project["script"]
    )
    preflight = call("GET", f"/api/projects/{pid}/preflight")
    assert preflight["valid"] and preflight["duration_ms"] == 43000, preflight
    state.update(project=updated, preflight=preflight)
    manifest.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    (ROOT / "out/project.json").write_text(json.dumps(updated, ensure_ascii=False, indent=2))
    job = call(
        "POST",
        f"/api/projects/{pid}/renders",
        json={
            "expected_revision": updated["revision"],
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
            {"project_id": pid, "revision": updated["revision"], "job_id": job["id"], "preflight": preflight}
        ),
        flush=True,
    )
