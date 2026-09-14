"""Bounded final mix revision, verification, and delivery of the owned pilot."""

import json
import sys

from produce import checkpoint, request, save, state


def polish():
    pid = state["project"]["id"]
    project = request("GET", f"/api/projects/{pid}")
    if project["revision"] != 2:
        raise RuntimeError("Expected the inspected revision 2; reread before another mix change.")
    profile = dict(project["profile"], target_lufs=-24, normalize=False)
    operations = [{"type": "update_project", "payload": {"profile": profile}}]
    for track in project["tracks"]:
        if track["kind"] == "sound":
            operations.append(
                {"type": "update_track", "payload": {"track_id": track["id"], "changes": {"gain_db": 9}}}
            )
    batch = {"expected_revision": project["revision"], "operations": operations, "dry_run": True}
    save("mix-dry-run.json", request("POST", f"/api/projects/{pid}/operations/batch", json=batch))
    batch["dry_run"] = False
    result = request("POST", f"/api/projects/{pid}/operations/batch", json=batch)
    state["composition"] = {"revision": result["project"]["revision"], "committed": result["committed"]}
    state["previous_exports"] = [{"job": state["job"], "verification": state.pop("verification", None)}]
    checkpoint()
    save(
        "preflight.json",
        request("GET", f"/api/projects/{pid}/preflight?revision={state['composition']['revision']}"),
    )
    state["job"] = request(
        "POST",
        f"/api/projects/{pid}/renders",
        json={"expected_revision": state["composition"]["revision"], "quality": "final"},
    )
    checkpoint()
    print("Final mix revision", state["composition"], "job", state["job"]["id"])


def verification():
    task = request("GET", f"/api/production/tasks/{state['verification']['id']}")
    state["verification"] = task
    checkpoint()
    save("verification.json", task)
    print(json.dumps(task, ensure_ascii=False, indent=2))


def package():
    task = request("GET", f"/api/production/tasks/{state['verification']['id']}")
    if task["status"] != "completed" or not task["result"]["verification"]["passed"]:
        raise RuntimeError("Inspect the verification result before packaging.")
    state["verification"] = task
    state["package"] = request(
        "POST",
        "/api/production/tasks",
        json={
            "request_key": f"turnwise-delivery-{state['job']['id']}",
            "request": {
                "type": "package_delivery",
                "job_id": state["job"]["id"],
                "verification_task_id": task["id"],
                "caption_track_ids": [],
            },
        },
    )
    checkpoint()
    print("Delivery task", state["package"]["id"])


def collect():
    task = request("GET", f"/api/production/tasks/{state['package']['id']}")
    state["package"] = task
    checkpoint()
    save("delivery.json", task)
    print(json.dumps(task, ensure_ascii=False, indent=2))
    save("project-final.json", request("GET", f"/api/projects/{state['project']['id']}"))
    save("channel-final.json", request("GET", f"/api/channels/{state['channel']['id']}"))


def review():
    channel = request("GET", f"/api/channels/{state['channel']['id']}")
    if channel["reviews"]:
        raise RuntimeError("A review already exists; do not append a duplicate.")
    body = {
        "expected_version": channel["channel"]["version"],
        "project_id": state["project"]["id"],
        "project_revision": state["job"]["revision"],
        "author": "Codex · visual and technical draft review",
        "hook": 8,
        "pacing": 7,
        "clarity": 9,
        "cta": 9,
        "channel_fit": 9,
        "evidence": f"Inspected actual export {state['job']['id']} at 0, 2.1, 5, 8, 10.8, 13, 14.5, 16, 17, 18.5, 20 and 21.9 seconds. Full decode and measured metadata are in the linked verify_render task. Final audio measurements are recorded in examples/turnwise/out/audio-analysis.json. Synkinema browser playback checked from Play to the 22-second end. This is an agent review of a prepared draft, not human comprehension testing, subjective listening, publication approval or a performance forecast. CTA score means a clean wordless ending under this channel's policy, not spoken engagement bait. Synkinema's rubric differs from the owner's weighted 100-point rubric.",
        "strengths": "The opening shows the object and aperture together. Original continuous animation keeps the same engraved piece, fixed scale and real hole. Camera descent shows passage below the plate. A 2.3-second final beat completes the answer. No dialogue, captions, unrelated imagery or third-party footage. Four editable tracks and separate sound events.",
        "improvements": "Before publication: have several people explain the intended action and outcome after muted/title-free viewing; audition effects on phone speakers and headphones; check the actual Shorts and TikTok overlays. The mechanism is intentionally simple and the turn is deliberate; future original episodes should test a less obvious puzzle or shorter rotation, without presenting this unmeasured suggestion as a proven learning.",
    }
    result = request("POST", f"/api/channels/{state['channel']['id']}/reviews", json=body)
    save("channel-final.json", result)
    state["channel"] = result["channel"]
    checkpoint()
    print("Recorded draft review at project revision", body["project_revision"])


if __name__ == "__main__":
    {
        "polish": polish,
        "verification": verification,
        "package": package,
        "collect": collect,
        "review": review,
    }[sys.argv[1]]()
