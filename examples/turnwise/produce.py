"""Create only the requested local Turnwise channel/project through supported REST."""

import hashlib
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
STATE = OUT / "production.json"
ORIGIN = "http://127.0.0.1:43817"
state = json.loads(STATE.read_text()) if STATE.exists() else {}
client = httpx.Client(base_url=ORIGIN, timeout=240)
BEATS = [
    (0, 3000, "The obstacle", "The piece approaches the round opening and touches the rim."),
    (3000, 5000, "A clear opening", "Lift and move back so the entire hole is visible."),
    (5000, 10800, "A different orientation", "Rotate the same engraved rigid piece onto its end."),
    (10800, 13000, "The last clue", "Align its narrow circular end over the opening."),
    (13000, 17000, "It passes", "Show continuous passage; lower the camera to prove the exit."),
    (17000, 19700, "Settle", "The same piece tips onto its side below the plate."),
    (19700, 22000, "The complete answer", "Hold a clear view of the empty hole and the piece below."),
]
COPY = {
    "title": "The long way through",
    "description": "A long piece. A small opening. One change of perspective.\nAn original 3D animation with quiet, wordless sound design.\n\n#visualpuzzle #satisfying #turnwise",
    "status": "Prepared locally; not published or scheduled. Human review required before publication.",
}


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))


def checkpoint():
    save(STATE.name, state)


def request(method, url, **kwargs):
    response = client.request(method, url, **kwargs)
    if response.is_error:
        raise RuntimeError(f"{method} {url}: {response.status_code} {response.text[:3000]}")
    return response.json()


def create():
    if "channel" not in state:
        channels = request("GET", "/api/channels")
        if any(c["name"] == "Turnwise" for c in channels):
            raise RuntimeError("A Turnwise channel already exists; inspect before creating or changing it.")
        with (ROOT / "assets/turnwise-logo.png").open("rb") as file:
            logo = request(
                "POST", "/api/channel-logos", files={"file": ("turnwise-logo.png", file, "image/png")}
            )
        brief = json.loads((ROOT / "channel.json").read_text())
        brief["logo_id"] = logo["id"]
        state["channel"] = request("POST", "/api/channels", json=brief)
        checkpoint()
        print("Created channel", state["channel"]["id"], flush=True)
    if "project" not in state:
        script = (
            "TITLE: "
            + COPY["title"]
            + "\n\n"
            + "\n".join(
                f"{start / 1000:.1f}–{end / 1000:.1f}s | {title} | {notes}"
                for start, end, title, notes in BEATS
            )
        )
        script += "\n\nNO DIALOGUE / NO VOICEOVER / NO CAPTIONS\n\nPUBLICATION COPY\n" + COPY["description"]
        state["project"] = request(
            "POST",
            "/api/projects",
            json={
                "channel_id": state["channel"]["id"],
                "name": "Turnwise 001 — The long way through",
                "brief": "Series: Will it work?\nQuestion: Can this long brass piece get through the small circular opening?\nAnswer: its circular cross-section fits when it stands on end. The whole passage and the unchanged engraved piece are shown.\nOriginal contribution: concept, procedural 3D models/materials, animation, camera choreography, edit and synthesized sound design created for this project. This is a stylized animation, not a recording or a physics simulation.\n22 s, 1080 × 1920, 30 fps. No dialogue, text overlays or music bed. Separate editable sound clips.\nTitle: "
                + COPY["title"]
                + "\nDescription:\n"
                + COPY["description"]
                + "\n\nSource and reproduction: examples/turnwise/. All picture/sound sources created locally for this episode; source code and hashes retained. No third-party footage/music.\nPublication: draft for owner review; no account created, no upload or scheduling. Pending: muted comprehension test, subjective audio audition and actual platform previews.",
                "script": script,
                "profile": {
                    "name": "Turnwise · Shorts / TikTok",
                    "kind": "short",
                    "width": 1080,
                    "height": 1920,
                    "fps": 30,
                    "crf": 18,
                    "normalize": False,
                },
                "scenes": [
                    {
                        "id": f"beat-{i + 1}",
                        "title": title,
                        "notes": notes,
                        "start_ms": start,
                        "duration_ms": end - start,
                    }
                    for i, (start, end, title, notes) in enumerate(BEATS)
                ],
                "tracks": [
                    {
                        "id": "picture",
                        "name": "Picture · original continuous 3D story",
                        "kind": "video",
                        "clips": [],
                    },
                    {"id": "movement", "name": "Sound · movement", "kind": "sound", "clips": []},
                    {"id": "contact", "name": "Sound · contact", "kind": "sound", "clips": []},
                    {"id": "resolution", "name": "Sound · resolution accent", "kind": "sound", "clips": []},
                ],
            },
        )
        checkpoint()
        print("Created linked project", state["project"]["id"], flush=True)
    pid = state["project"]["id"]
    state.setdefault("assets", {})
    files = [ROOT / "assets/turnwise-001-picture.mp4", *sorted((ROOT / "assets").glob("*.wav"))]
    for path in files:
        if path.name in state["assets"]:
            continue
        with path.open("rb") as file:
            asset = request(
                "POST",
                "/api/assets",
                files={"file": (path.name, file)},
                data={
                    "project_id": pid,
                    "tags": json.dumps(
                        [
                            "turnwise",
                            "episode-001",
                            "original",
                            "procedural-animation" if path.suffix == ".mp4" else "procedural-sound",
                        ]
                    ),
                    "source": f"Created for the owner in examples/turnwise/{'scene.html + render.mjs' if path.suffix == '.mp4' else 'create_assets.py'} on 2026-09-14. SHA256: {hashlib.sha256(path.read_bytes()).hexdigest()}",
                    "license": "Original code-created production for this project; no third-party footage, music, voices, texture or models used. Source and deterministic parameters retained. Not a third-party stock license or a claim about copyright eligibility.",
                },
            )
        state["assets"][path.name] = asset
        checkpoint()
        print("Imported", path.name, asset["duration_ms"], "ms", flush=True)
    if "composition" not in state:
        project = request("GET", f"/api/projects/{pid}")
        if any(track["clips"] for track in project["tracks"]):
            raise RuntimeError("Timeline is no longer empty; inspect before adding clips.")
        save("add-clip-reference.json", request("GET", "/api/schema/operations?operation=add_clip"))
        video = state["assets"]["turnwise-001-picture.mp4"]
        assert video["duration_ms"] >= 22000 and video["width"] == 1080 and video["height"] == 1920
        operations = []
        for i, (start, end, title, _) in enumerate(BEATS):
            operations.append(
                {
                    "type": "add_clip",
                    "payload": {
                        "track_id": "picture",
                        "clip": {
                            "id": f"picture-{i + 1}",
                            "asset_id": video["id"],
                            "name": title,
                            "start_ms": start,
                            "source_in_ms": start,
                            "duration_ms": end - start,
                        },
                    },
                }
            )
        for i, (name, start, duration, gain, label) in enumerate(
            json.loads((OUT / "sound-events.json").read_text())
        ):
            asset = state["assets"][name]
            assert asset["duration_ms"] >= duration
            track = (
                "resolution"
                if "resolve" in name
                else "contact"
                if any(x in name for x in ["tap", "settle"])
                else "movement"
            )
            operations.append(
                {
                    "type": "add_clip",
                    "payload": {
                        "track_id": track,
                        "clip": {
                            "id": f"sound-{i + 1}",
                            "asset_id": asset["id"],
                            "name": label,
                            "start_ms": start,
                            "duration_ms": duration,
                            "gain_db": gain,
                            "fade_in_ms": 5,
                            "fade_out_ms": 40,
                        },
                    },
                }
            )
        batch = {"expected_revision": project["revision"], "operations": operations, "dry_run": True}
        save("composition-dry-run.json", request("POST", f"/api/projects/{pid}/operations/batch", json=batch))
        batch["dry_run"] = False
        result = request("POST", f"/api/projects/{pid}/operations/batch", json=batch)
        state["composition"] = {"revision": result["project"]["revision"], "committed": result["committed"]}
        checkpoint()
        print("Committed composition", state["composition"], flush=True)
    if "job" not in state:
        project = request("GET", f"/api/projects/{pid}")
        preflight = request("GET", f"/api/projects/{pid}/preflight?revision={project['revision']}")
        save("preflight.json", preflight)
        if not preflight["valid"]:
            raise RuntimeError(preflight)
        state["job"] = request(
            "POST",
            f"/api/projects/{pid}/renders",
            json={"expected_revision": project["revision"], "quality": "final"},
        )
        checkpoint()
        print("Queued final export", state["job"]["id"], flush=True)
    save("publication-copy.json", COPY)


def status():
    job = request("GET", f"/api/jobs/{state['job']['id']}")
    state["job"] = job
    checkpoint()
    print(json.dumps(job, ensure_ascii=False, indent=2))


def inspect():
    job = request("GET", f"/api/jobs/{state['job']['id']}")
    if job["status"] != "completed":
        raise RuntimeError(f"Export is {job['status']}")
    state["job"] = job
    checkpoint()
    pid, jid = state["project"]["id"], job["id"]
    video = client.get(job["output_url"])
    video.raise_for_status()
    (OUT / "turnwise-001-final.mp4").write_bytes(video.content)
    sheet = request(
        "POST",
        f"/api/projects/{pid}/inspection/sheet",
        json={
            "job_id": jid,
            "timestamps_ms": [0, 2100, 5000, 8000, 10800, 13000, 14500, 16000, 17000, 18500, 20000, 21900],
        },
    )
    save("final-sheet.json", sheet)
    image = client.get(sheet["url"])
    image.raise_for_status()
    (OUT / "final-contact-sheet.jpg").write_bytes(image.content)
    save(
        "audio-analysis.json", request("POST", f"/api/projects/{pid}/inspection/audio", json={"job_id": jid})
    )
    if "verification" not in state:
        state["verification"] = request(
            "POST",
            "/api/production/tasks",
            json={
                "request_key": f"turnwise-001-verify-{jid}",
                "request": {"type": "verify_render", "job_id": jid, "transcribe": False},
            },
        )
        checkpoint()
    print("Saved final video, actual-export contact sheet and audio analysis.")
    print("Verification task", state["verification"]["id"])


if __name__ == "__main__":
    {"create": create, "status": status, "inspect": inspect}[sys.argv[1]]()
