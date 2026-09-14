"""Apply reviewed source/time and title-spacing refinements to revision2, then export final."""

import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
state = json.loads((ROOT / "out/manifest.json").read_text())
pid = state["project"]["id"]
with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as api:

    def call(method, path, **kw):
        r = api.request(method, path, **kw)
        if r.is_error:
            raise RuntimeError(f"{r.status_code}: {r.text}")
        return r.json()

    p = call("GET", f"/api/projects/{pid}")
    assert p["revision"] == 2, "This reviewed polish only applies once to revision2."
    operations = []
    for track in p["tracks"]:
        for clip in track["clips"]:
            changes = {}
            if track["id"] == "game-names" and clip["start_ms"] == 38000:
                changes.update(
                    text="WHICH ONE\nMAKES YOU QUIT?",
                    name="Which one makes you quit?",
                    font_size=80,
                    text_y=0.145,
                )
            if track["id"] == "game-names" and 3000 <= clip["start_ms"] < 38000:
                changes["text_y"] = 0.145
            if track["id"] in ["atmosphere", "gameplay"]:
                if clip["start_ms"] == 41333 and clip["source_in_ms"] == 52000:
                    changes.update(source_in_ms=20000, name=clip["name"].replace("52s", "20s"))
                if clip["asset_id"] == state["assets"]["cabin"]["id"] and clip["source_in_ms"] == 101000:
                    changes.update(source_in_ms=106000, name=clip["name"].replace("101s", "106s"))
                if clip["asset_id"] == state["assets"]["ward"]["id"] and clip["source_in_ms"] == 49000:
                    changes.update(source_in_ms=39000, name=clip["name"].replace("49s", "39s"))
                if track["id"] == "atmosphere" and clip["start_ms"] == 2000:
                    changes.update(source_in_ms=107000, name="Cabin · opening threat")
            if changes:
                operations.append(
                    {
                        "type": "update_clip",
                        "payload": {"track_id": track["id"], "clip_id": clip["id"], "changes": changes},
                    }
                )
    batch = {"expected_revision": p["revision"], "operations": operations, "dry_run": True}
    call("POST", f"/api/projects/{pid}/operations/batch", json=batch)
    p = call("POST", f"/api/projects/{pid}/operations/batch", json={**batch, "dry_run": False})["project"]
    preflight = call("GET", f"/api/projects/{pid}/preflight")
    assert preflight["valid"], preflight
    state.update(project=p, preflight=preflight)
    (ROOT / "out/manifest.json").write_text(json.dumps(state, ensure_ascii=False, indent=2))
    (ROOT / "out/project.json").write_text(json.dumps(p, ensure_ascii=False, indent=2))
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
            {"project_id": pid, "job_id": job["id"], "revision": p["revision"], "preflight": preflight}
        ),
        flush=True,
    )
