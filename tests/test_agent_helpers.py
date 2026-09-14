import json
import subprocess

import httpx
import pytest
from fastapi.testclient import TestClient
from synkinema.agent_reference import operation_reference
from synkinema.app import create_app
from synkinema.cli import build_parser, checked, dispatch, wait_job


@pytest.fixture
def context(tmp_path):
    app = create_app(tmp_path / "data", start_worker=False)
    with TestClient(app) as client:
        sample = tmp_path / "source.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=green:s=128x128:r=12",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000",
                "-t",
                "8",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                str(sample),
            ],
            check=True,
        )
        with sample.open("rb") as file:
            asset = client.post("/api/assets", files={"file": (sample.name, file)}).json()
        project = client.post("/api/projects", json={"name": "Helper contract"}).json()
        yield client, app.state.service, asset, project


def post_batch(c, p, steps, dry_run=False, status=200):
    response = c.post(
        f"/api/projects/{p['id']}/operations/batch",
        json={
            "expected_revision": p["revision"],
            "operations": steps,
            "dry_run": dry_run,
        },
    )
    assert response.status_code == status, response.text
    return response.json()


def step(operation_type, **payload):
    return {"type": operation_type, "payload": payload}


def test_batch_dry_run_commit_rollback_stale_and_restore(context):
    c, service, asset, p = context
    steps = [
        step(
            "append_clip",
            track_id="video",
            clip={"id": "a", "asset_id": asset["id"], "source_in_ms": 1000, "speed": 2},
        ),
        step("extract_audio", track_id="video", clip_id="a", target_track_id="voice", new_clip_id="a-audio"),
        step("duplicate_clip", track_id="video", clip_id="a", new_clip_id="b"),
        step("add_track", id="voice2", name="Voiceover 2", kind="voiceover"),
        step("extract_audio", track_id="video", clip_id="b", target_track_id="voice2", new_clip_id="b-audio"),
        step(
            "set_transition",
            track_id="video",
            clip_id="b",
            transition={"type": "crossfade", "duration_ms": 300},
        ),
    ]
    preview = post_batch(c, p, steps, dry_run=True)
    assert preview["committed"] is False and preview["project"]["revision"] == 2
    assert service.get(p["id"]).revision == 1 and len(service.history(p["id"])) == 1
    result = post_batch(c, p, steps)
    assert result["committed"] and result["applied_operations"] == 6
    assert preview["project"] == result["project"]  # Explicit IDs make the candidate reproducible.
    edited = result["project"]
    clips = edited["tracks"][0]["clips"]
    audio = edited["tracks"][2]["clips"] + edited["tracks"][-1]["clips"]
    expected = (asset["duration_ms"] - 1000) // 2
    assert [item["start_ms"] for item in clips] == [0, expected - 300]
    for video, sound in zip(clips, audio, strict=True):
        assert (video["start_ms"], video["source_in_ms"], video["speed"], video["duration_ms"]) == (
            sound["start_ms"],
            sound["source_in_ms"],
            sound["speed"],
            sound["duration_ms"],
        )
    assert service.history(p["id"])[0]["operation"] == "batch"
    assert len(service.history(p["id"])) == 2
    post_batch(c, p, steps, status=409)
    # Failed late step rolls back earlier valid updates.
    failed = post_batch(
        c,
        edited,
        [
            step("update_project", name="Should roll back"),
            step("remove_clip", track_id="video", clip_id="missing"),
        ],
        status=422,
    )
    assert "Step 2" in failed["detail"]
    assert service.summary(service.get(p["id"])) == edited
    # Final overlap validation also rolls back even when individual low-level edits permit it.
    post_batch(
        c, edited, [step("update_clip", track_id="video", clip_id="b", changes={"start_ms": 0})], status=422
    )
    assert service.get(p["id"]).revision == 2
    restored = post_batch(c, edited, [step("restore_revision", revision=1)])["project"]
    assert restored["revision"] == 3 and restored["duration_ms"] == 0


def test_helper_examples_and_rejections(context):
    c, service, asset, p = context
    refs = operation_reference()["operations"]
    steps = [step("add_track", id="sound", name="Audio", kind="sound")]
    for name in ("append_clip", "duplicate_clip", "extract_audio"):
        payload = json.loads(json.dumps(refs[name]["example_payload"]).replace("ASSET_ID", asset["id"]))
        steps.append({"type": name, "payload": payload})
    p = post_batch(c, p, steps)["project"]
    assert p["duration_ms"] == 4000
    for invalid in [
        step("append_clip", track_id="video", clip={"asset_id": asset["id"], "start_ms": 0}),
        step(
            "append_clip",
            track_id="video",
            clip={"asset_id": asset["id"], "source_in_ms": asset["duration_ms"] + 1},
        ),
        step("append_clip", track_id="video", clip={"asset_id": asset["id"], "speed": 0}),
        step("duplicate_clip", track_id="video", clip_id="appended", new_clip_id="duplicate"),
        step("duplicate_clip", track_id="video", clip_id="appended", start_ms=0),
        step("extract_audio", track_id="video", clip_id="appended", target_track_id="titles"),
    ]:
        post_batch(c, p, [invalid], status=422)
        assert service.get(p["id"]).revision == p["revision"]
    # A silent source cannot be extracted.
    silent = dict(asset, has_audio=False)
    service.store.execute(
        "UPDATE assets SET document=:doc WHERE id=:id", id=asset["id"], doc=json.dumps(silent)
    )
    post_batch(
        c,
        p,
        [step("extract_audio", track_id="video", clip_id="appended", target_track_id="voice")],
        status=422,
    )


def test_transition_ripple_cannot_overlap_audio_and_extraction_requires_free_slot(context):
    c, service, asset, p = context
    steps = []
    for clip_id in ("a", "b"):
        steps.extend(
            [
                step(
                    "append_clip",
                    track_id="video",
                    clip={"id": clip_id, "asset_id": asset["id"], "duration_ms": 2000},
                ),
                step("extract_audio", track_id="video", clip_id=clip_id, target_track_id="voice"),
            ]
        )
    p = post_batch(c, p, steps)["project"]
    for rejected in [
        step(
            "set_transition",
            track_id="video",
            clip_id="b",
            transition={"type": "crossfade", "duration_ms": 300},
        ),
        step("extract_audio", track_id="video", clip_id="a", target_track_id="voice"),
        step("update_clip", track_id="video", clip_id="b", changes={"start_ms": 1500}),
    ]:
        response = c.post(
            f"/api/projects/{p['id']}/operations", json={"expected_revision": p["revision"], **rejected}
        )
        assert response.status_code == 422, response.text
        assert service.get(p["id"]).revision == p["revision"]


def test_extracted_audio_strips_visual_animation_but_preserves_timing(context):
    c, _service, asset, p = context
    p = post_batch(
        c,
        p,
        [
            step(
                "add_clip",
                track_id="video",
                clip={
                    "id": "v",
                    "asset_id": asset["id"],
                    "start_ms": 500,
                    "duration_ms": 2000,
                    "source_in_ms": 750,
                    "speed": 1.25,
                    "gain_db": -5,
                    "fade_in_ms": 150,
                    "fade_out_ms": 200,
                    "effects": [{"type": "blur", "value": 3}],
                    "animations": [
                        {
                            "property": "scale",
                            "keyframes": [{"time_ms": 0, "value": 1}, {"time_ms": 2000, "value": 1.2}],
                        }
                    ],
                },
            ),
            step("extract_audio", track_id="video", clip_id="v", target_track_id="voice"),
        ],
    )["project"]
    audio = p["tracks"][2]["clips"][0]
    assert audio["animations"] == [] and audio["effects"] == []
    assert (
        audio["start_ms"],
        audio["duration_ms"],
        audio["source_in_ms"],
        audio["speed"],
        audio["gain_db"],
        audio["fade_in_ms"],
        audio["fade_out_ms"],
    ) == (500, 2000, 750, 1.25, -5, 150, 200)
    assert len(p["tracks"][0]["clips"][0]["animations"]) == 1


def test_preflight_clone_revision_and_captions(context):
    c, service, asset, p = context
    base = f"/api/projects/{p['id']}"
    report = c.get(base + "/preflight").json()
    assert report["valid"] is False and report["errors"][0]["code"] == "empty_timeline"
    p = post_batch(
        c,
        p,
        [
            step(
                "add_clip",
                track_id="video",
                clip={"asset_id": asset["id"], "start_ms": 1000, "duration_ms": 2000},
            ),
            step(
                "add_clip",
                track_id="titles",
                clip={"text": "Polska", "subtitle": "Chroń naturę", "start_ms": 3500, "duration_ms": 1000},
            ),
            step("update_track", track_id="titles", changes={"muted": True}),
        ],
    )["project"]
    report = c.get(base + "/preflight", params={"revision": 2}).json()
    assert report["valid"] and report["requires_render_review"]
    assert {w["code"] for w in report["warnings"]} >= {"no_audio", "primary_video_gap", "muted_tail"}
    assert service.get(p["id"]).revision == 2 and service.jobs() == []
    assert c.get(base + "/captions.srt").text == ""
    srt = c.get(base + "/captions.srt", params={"include_muted": "true", "revision": 2})
    assert "00:00:03,500 --> 00:00:04,500\nPolska\nChroń naturę" in srt.text
    assert srt.headers["X-Project-Revision"] == "2"
    assert c.get(base + "/inspection/points", params={"revision": 1}).json()["revision"] == 1
    cloned = c.post(base + "/clone", json={"name": "Alternative", "revision": 2}).json()
    assert cloned["id"] != p["id"] and cloned["revision"] == 1
    assert cloned["tracks"] == p["tracks"]
    post_batch(c, cloned, [step("update_track", track_id="titles", changes={"muted": False})])
    assert service.get(p["id"]).tracks[1].muted
    assert c.post(base + "/clone", json={"name": "Unknown", "revision": 99}).status_code == 404
    service.store.path(asset["path"]).unlink()
    report = service.preflight(p["id"])
    assert not report["valid"] and any(e["code"] == "missing_media_file" for e in report["errors"])


def test_mcp_new_helpers_roundtrip(context):
    c, _service, asset, p = context

    def call(tool_name, **arguments):
        response = c.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
            },
        ).json()["result"]
        assert not response.get("isError"), response
        return response.get("structuredContent") or json.loads(response["content"][0]["text"])

    assert call("get_asset", asset_id=asset["id"])["has_audio"]
    assert not call("validate_project", project_id=p["id"])["valid"]
    request = {
        "expected_revision": 1,
        "operations": [step("append_clip", track_id="titles", clip={"text": "MCP", "duration_ms": 1000})],
        "dry_run": True,
    }
    assert not call("apply_operations", project_id=p["id"], request=request)["committed"]
    request["dry_run"] = False
    p = call("apply_operations", project_id=p["id"], request=request)["project"]
    assert call("export_captions", project_id=p["id"], revision=2)["cue_count"] == 1
    clone = call("clone_project", project_id=p["id"], name="MCP clone", revision=2)
    assert clone["revision"] == 1
    note = call("create_review_comment", project_id=p["id"], revision=2, time_ms=0, message="Review")
    assert call("resolve_review_comment", project_id=p["id"], comment_id=note["id"])["resolved"]
    assert c.patch(f"/api/projects/{clone['id']}/comments/{note['id']}").status_code == 404
    job = call("start_render", project_id=p["id"], expected_revision=2)
    jobs = call("list_render_jobs", project_id=p["id"])
    if isinstance(jobs, dict):  # SDK wraps annotated lists in structuredContent.result.
        jobs = jobs["result"]
    assert jobs[0]["id"] == job["id"] and "snapshot" not in jobs[0]
    assert call("cancel_render", job_id=job["id"])["status"] == "cancelled"


def test_cli_revision_pinning_batch_and_generic_request(tmp_path):
    requests = []

    def handler(request):
        requests.append(request)
        if request.method == "GET" and request.url.path == "/api/projects/p":
            return httpx.Response(200, json={"revision": 7})
        return httpx.Response(200, json={"id": "job", "status": "completed"})

    parser = build_parser()
    with httpx.Client(base_url="http://testserver", transport=httpx.MockTransport(handler)) as c:
        checked(
            dispatch(
                c,
                parser.parse_args(
                    ["render", "p", "--preview", "--from-ms", "500", "--to-ms", "1500", "--wait"]
                ),
            )
        )
        assert json.loads(requests[1].content) == {
            "expected_revision": 7,
            "quality": "preview",
            "from_ms": 500,
            "to_ms": 1500,
        }
        assert requests[2].url.path == "/api/jobs/job"
        data = tmp_path / "batch.json"
        data.write_text(
            json.dumps({"expected_revision": 7, "operations": [step("update_project", name="Cut")]})
        )
        dispatch(c, parser.parse_args(["batch", "p", str(data), "--dry-run"]))
        assert (
            requests[-1].url.path.endswith("/operations/batch")
            and json.loads(requests[-1].content)["dry_run"]
        )
        dispatch(
            c,
            parser.parse_args(
                ["request", "POST", "/api/projects/p/inspection/sheet", "--json-file", str(data)]
            ),
        )
        assert requests[-1].method == "POST"
        with pytest.raises(ValueError, match="/api/"):
            dispatch(c, parser.parse_args(["request", "GET", "https://example.com/api/"]))
    with httpx.Client(
        base_url="http://testserver",
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json={"status": "failed", "error": "Bad media"})
        ),
    ) as c:
        with pytest.raises(ValueError, match="Bad media"):
            wait_job(c, "broken", 2)
        with pytest.raises(ValueError, match="positive"):
            wait_job(c, "broken", 0)


def test_batch_concurrent_writers_cannot_overwrite(context):
    from concurrent.futures import ThreadPoolExecutor

    from synkinema.models import BatchRequest
    from synkinema.service import Conflict

    _c, service, _asset, p = context

    def writer(name):
        try:
            service.batch(
                p["id"], BatchRequest(expected_revision=1, operations=[step("update_project", name=name)])
            )
            return "committed"
        except Conflict:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(writer, ["First writer", "Second writer"]))
    assert sorted(results) == ["committed", "conflict"]
    assert service.get(p["id"]).revision == 2 and len(service.history(p["id"])) == 2


def test_project_job_filter_is_applied_before_limit(context):
    from sqlalchemy import text
    from synkinema.models import Project

    c, service, _asset, p = context
    other = service.create(Project(name="Busy other project"))
    jobs = [
        {
            "id": "old-project-job",
            "project_id": p["id"],
            "status": "completed",
            "created_at": "000",
            "snapshot": {"private": True},
        }
    ]
    jobs.extend(
        {"id": f"other-{i}", "project_id": other.id, "status": "completed", "created_at": f"{i + 1:03}"}
        for i in range(105)
    )
    for job in jobs:
        job.update(
            project_name="Test project",
            revision=1,
            progress=1,
            phase="Complete",
            request={"quality": "final", "from_ms": 0, "to_ms": None, "expected_revision": None},
            error=None,
            output_url=None,
        )
    with service.store.transaction() as conn:
        conn.execute(
            text("INSERT INTO jobs VALUES(:id,:pid,:status,:doc,:time)"),
            [
                {
                    "id": j["id"],
                    "pid": j["project_id"],
                    "status": j["status"],
                    "doc": json.dumps(j),
                    "time": j["created_at"],
                }
                for j in jobs
            ],
        )
    assert len(service.jobs()) == 100
    result = c.get("/api/jobs", params={"project_id": p["id"]}).json()
    assert len(result) == 1 and result[0]["id"] == "old-project-job"
    assert "snapshot" not in result[0]
