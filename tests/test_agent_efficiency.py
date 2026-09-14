"""Bounded MCP reads and measured editing plans against isolated disposable media."""

import asyncio
import json
import subprocess
import wave
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from synkinema.agent_tools import (
    EditAudit,
    EditContext,
    NarrationCut,
    ProjectBrowse,
    WorkStatus,
    audit_edit,
    browse_projects,
    compact_batch,
    edit_context,
    plan_narration_cut,
    work_item,
    work_status,
)
from synkinema.app import create_app
from synkinema.inspection import Inspection
from synkinema.models import BatchRequest, Clip, Operation, Project, Track
from synkinema.service import Conflict, Service
from synkinema.source_analysis import SourceAnalysis, SourceAnalysisRequest, intervals, silence_cut_segments
from synkinema.storage import Store


@pytest.fixture
def service(tmp_path):
    return Service(Store(tmp_path / "data"))


@pytest.fixture
def voice(service, tmp_path):
    rate = 16000
    tone = (np.sin(np.arange(rate) * 2 * np.pi * 440 / rate) * 10000).astype(np.int16)
    samples = np.concatenate(
        [
            np.zeros(8000, dtype=np.int16),
            tone,
            np.zeros(6400, dtype=np.int16),
            tone,
            np.zeros(8000, dtype=np.int16),
        ]
    )
    path = tmp_path / "narration.wav"
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(samples.tobytes())
    return service.import_file(path)


def test_compact_index_context_and_bounded_paging(service):
    projects = []
    for i in range(3):
        projects.append(
            service.create(
                Project(
                    name=f"Short {i}",
                    script="private long script " * 500,
                    tracks=[
                        Track(
                            id="titles",
                            name="Captions",
                            kind="text",
                            clips=[
                                Clip(id=f"c{j}", text=f"Caption {j}", start_ms=j * 500, duration_ms=500)
                                for j in range(80)
                            ],
                        )
                    ],
                )
            )
        )
    full = service.projects()
    index = browse_projects(service, ProjectBrowse(limit=2))
    assert len(index["items"]) == 2 and index["total"] == 3 and index["next_offset"] == 2
    assert len(json.dumps(index)) < len(json.dumps(full)) / 50
    assert browse_projects(service, ProjectBrowse(query="%"))["total"] == 0  # Literal, not SQL wildcard.
    assert browse_projects(service, ProjectBrowse(query="SHORT 1"))["total"] == 1
    service.create(Project(name="ŻÓŁĆ"))
    assert browse_projects(service, ProjectBrowse(query="żółć"))["total"] == 1
    p = projects[0]
    first = edit_context(service, EditContext(project_id=p.id, limit=2))
    assert first["next_offset"] == 2 and first["clips"][0]["start_ms"] == 0
    assert "script" not in first and "transform" not in first["clips"][0]
    service.apply(p.id, Operation(expected_revision=1, type="update_project", payload={"name": "Changed"}))
    second = edit_context(service, EditContext(project_id=p.id, revision=1, offset=2, limit=2))
    assert second["revision"] == 1 and second["name"] == "Short 0"
    assert second["clips"][0]["id"] == "c2"
    assert edit_context(service, EditContext(project_id=p.id, from_ms=500, to_ms=1000))["matching_clips"] == 1
    with pytest.raises(ValueError, match="Unknown track"):
        edit_context(service, EditContext(project_id=p.id, track_ids=["missing"]))
    with pytest.raises(ValidationError):
        ProjectBrowse(limit=51)


def test_compact_ack_does_not_confirm_dry_run(service):
    p = service.create(Project(name="Plan"))
    request = BatchRequest(
        expected_revision=1,
        dry_run=True,
        operations=[
            {
                "type": "add_clip",
                "payload": {"track_id": "titles", "clip": {"id": "caption", "text": "Ready"}},
            }
        ],
    )
    result = compact_batch(service.batch(p.id, request))
    assert not result["committed"] and result["confirmed_revision"] == 1
    assert result["project"]["revision"] == 2 and "tracks" not in result["project"]
    request.dry_run = False
    result = compact_batch(service.batch(p.id, request))
    assert result["committed"] and result["confirmed_revision"] == 2
    with pytest.raises(Conflict):
        service.batch(p.id, request)


def test_compact_work_keeps_failure_partial_artifacts_and_qa():
    doc = {
        "id": "t",
        "status": "failed",
        "progress": 0.8,
        "error": "decode failed",
        "request": {"type": "prepare_narration", "project_id": "p"},
        "result": {
            "narration": [
                {
                    "id": "line1",
                    "asset": {"id": "a", "duration_ms": 3000},
                    "transcript": {"words": ["large"] * 1000},
                }
            ]
        },
    }
    compact = work_item(doc, "production")
    assert compact["error"] == "decode failed" and compact["partial_results"]
    assert compact["narration"] == [{"id": "line1", "asset_id": "a", "duration_ms": 3000}]
    assert "transcript" not in json.dumps(compact)
    doc["result"] = {
        "verification": {
            "passed": False,
            "audio": {
                "integrated_lufs": None,
                "true_peak_dbtp": None,
                "windows": [1] * 10000,
                "warnings": ["silent"],
            },
            "layout": {"passed": False, "issues": [{"code": "collision"}] * 12},
            "transcript": {"warnings": ["approximate"], "match_ratio": 0.5},
        }
    }
    qa = work_item(doc, "production")["verification"]
    assert qa["passed"] is False and qa["integrated_lufs"] is None and qa["layout_issue_count"] == 12
    assert len(qa["layout_issues"]) == 10 and qa["visual_review_required"]
    render = work_item(
        {"id": "j", "status": "running", "output_url": "wrong", "warnings": [{"code": "upscale"}] * 100},
        "render",
    )
    assert render["output_url"] is None and render["warning_counts"] == {"upscale": 100}


async def test_batch_status_partial_not_found_and_no_enqueue(service):
    def missing(_):
        raise KeyError("missing")

    result = await work_status(
        service, SimpleNamespace(get=missing), WorkStatus(task_ids=["unknown"], wait_seconds=1)
    )
    assert result["all_terminal"] and result["items"][0]["status"] == "not_found"
    with pytest.raises(ValidationError):
        WorkStatus(job_ids=["x", "x"])


def test_silence_parser_and_cut_math():
    assert intervals("silence_start: 0\nsilence_end: 0.5\nsilence_start: 2.9", "silence", 1000, 4400) == [
        {"from_ms": 1000, "to_ms": 1500},
        {"from_ms": 3900, "to_ms": 4400},
    ]
    gaps = [{"from_ms": 0, "to_ms": 500}, {"from_ms": 1500, "to_ms": 1900}, {"from_ms": 2900, "to_ms": 3400}]
    segments = silence_cut_segments(0, 3400, gaps)
    assert segments == [
        {"source_in_ms": 460, "start_ms": 0, "duration_ms": 1100},
        {"source_in_ms": 1840, "start_ms": 1100, "duration_ms": 1260},
    ]
    assert silence_cut_segments(0, 1000, []) == [{"source_in_ms": 0, "start_ms": 0, "duration_ms": 1000}]
    with pytest.raises(ValueError, match="Entire"):
        silence_cut_segments(0, 1000, [{"from_ms": 0, "to_ms": 1000}])
    # A tiny speech segment is retained along with extra silence, never discarded.
    short = silence_cut_segments(0, 1000, [{"from_ms": 0, "to_ms": 500}, {"from_ms": 530, "to_ms": 850}])
    assert any(s["source_in_ms"] <= 500 and s["source_in_ms"] + s["duration_ms"] >= 530 for s in short)


async def test_real_source_silence_cache_bounds_and_plan(service, voice):
    analysis = SourceAnalysis(service, Inspection(service))
    request = SourceAnalysisRequest(asset_id=voice["id"], mode="audio")
    measured = await analysis.analyze(request)
    assert len(measured["silence"]) == 3 and not measured["cached"]
    assert measured["video_analyzed"] is False and measured["black"] is None
    assert abs(measured["silence"][0]["to_ms"] - 500) < 10
    assert (await analysis.analyze(request))["cached"]
    partial = await analysis.analyze(
        SourceAnalysisRequest(asset_id=voice["id"], mode="audio", from_ms=1300, to_ms=2100)
    )
    assert abs(partial["silence"][0]["from_ms"] - 1500) < 10
    assert abs(partial["silence"][0]["to_ms"] - 1900) < 10
    with pytest.raises(ValueError):
        await analysis.analyze(SourceAnalysisRequest(asset_id=voice["id"], mode="video"))
    with pytest.raises(ValueError):
        await analysis.analyze(SourceAnalysisRequest(asset_id=voice["id"], to_ms=4000))
    p = service.create(
        Project(
            name="Voice cut",
            tracks=[
                Track(
                    id="voice",
                    name="Narrator",
                    kind="voiceover",
                    clips=[Clip(id="old", asset_id=voice["id"], duration_ms=3400)],
                )
            ],
        )
    )
    plan = await plan_narration_cut(
        service,
        analysis,
        NarrationCut(
            project_id=p.id,
            expected_revision=1,
            track_id="voice",
            asset_id=voice["id"],
            replace_clip_ids=["old"],
        ),
    )
    assert 1020 <= plan["removed_ms"] <= 1060
    assert service.get(p.id).revision == 1 and len(service.history(p.id)) == 1
    assert plan["request"]["dry_run"] is True and not plan["committed"]
    batch = BatchRequest.model_validate({**plan["request"], "dry_run": False})
    result = service.batch(p.id, batch)
    assert result["committed"] and result["project"]["duration_ms"] == plan["narration_duration_ms"]
    with pytest.raises(Conflict):
        await plan_narration_cut(
            service,
            analysis,
            NarrationCut(project_id=p.id, expected_revision=1, track_id="voice", asset_id=voice["id"]),
        )
    with pytest.raises(ValueError, match="replace_clip_ids"):
        await plan_narration_cut(
            service,
            analysis,
            NarrationCut(
                project_id=p.id,
                expected_revision=2,
                track_id="voice",
                asset_id=voice["id"],
                replace_clip_ids=["wrong"],
            ),
        )
    # A cached measurement must not conceal a missing file.
    service.store.path(voice["path"]).unlink()
    with pytest.raises(FileNotFoundError):
        await analysis.analyze(request)


async def test_plan_rechecks_revision_after_decode(service, voice):
    p = service.create(Project(name="Concurrent"))

    class RacingAnalysis:
        async def analyze(self, request):
            service.apply(
                p.id, Operation(expected_revision=1, type="update_project", payload={"name": "User edit"})
            )
            return {"from_ms": 0, "to_ms": 3400, "silence": []}

    with pytest.raises(Conflict):
        await plan_narration_cut(
            service,
            RacingAnalysis(),
            NarrationCut(project_id=p.id, expected_revision=1, track_id="voice", asset_id=voice["id"]),
        )
    assert service.get(p.id).name == "User edit" and not service.get(p.id).tracks[2].clips


async def test_real_black_freeze_analysis(service, tmp_path):
    path = tmp_path / "black.mp4"
    await asyncio.to_thread(
        subprocess.run,
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=black:s=128x128:r=24:d=2",
            "-c:v",
            "libx264",
            str(path),
        ],
        check=True,
    )
    asset = service.import_file(path)
    report = await SourceAnalysis(service, Inspection(service)).analyze(
        SourceAnalysisRequest(asset_id=asset["id"], mode="both")
    )
    assert report["silence"] is None and not report["audio_analyzed"]
    assert report["black"] and report["freeze"] and report["review_required"]
    assert report["black"][0]["from_ms"] == 0


def test_edit_audit_is_bounded_advisory_and_ignores_muted_tracks(service, voice, tmp_path):
    from PIL import Image

    image = tmp_path / "still.png"
    Image.new("RGB", (128, 128), "red").save(image)
    asset = service.import_file(image)
    p = service.create(
        Project(
            name="Bad cut",
            tracks=[
                Track(
                    id="v",
                    name="Static",
                    kind="video",
                    clips=[Clip(id="still", asset_id=asset["id"], duration_ms=8000)],
                ),
                Track(
                    id="o",
                    name="Small",
                    kind="overlay",
                    clips=[
                        Clip(id="small", asset_id=asset["id"], duration_ms=2000, placement={"height": 0.3})
                    ],
                ),
                Track(
                    id="voice",
                    name="Voice",
                    kind="voiceover",
                    clips=[Clip(id="n", asset_id=voice["id"], start_ms=1000, duration_ms=2000)],
                ),
                Track(
                    id="muted",
                    name="Muted",
                    kind="overlay",
                    muted=True,
                    clips=[Clip(id="hidden", asset_id=asset["id"], duration_ms=8000)],
                ),
            ],
        )
    )
    audit = audit_edit(service, EditAudit(project_id=p.id, max_issues=100))
    assert {"static_image_source", "small_visual_layer", "voice_timeline_gap"} <= {
        i["code"] for i in audit["issues"]
    }
    assert not any(i.get("clip_id") == "hidden" for i in audit["issues"])
    assert audit["structurally_valid"] and audit["requires_render_review"]
    bounded = audit_edit(service, EditAudit(project_id=p.id, max_issues=1))
    assert len(bounded["issues"]) == 1 and bounded["truncated"]
    assert service.get(p.id).revision == 1


def test_mcp_new_tools_and_compact_mutation(tmp_path):
    app = create_app(tmp_path / "mcp", start_worker=False)
    with TestClient(app) as client:

        def call(name, args):
            response = client.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": name, "arguments": args},
                },
            )
            result = response.json()["result"]
            assert not result.get("isError"), result
            return result.get("structuredContent") or json.loads(result["content"][0]["text"])

        p = call("create_project", {"name": "MCP compact"})
        assert call("browse_projects", {"request": {}})["items"][0]["id"] == p["id"]
        assert call("get_edit_context", {"request": {"project_id": p["id"]}})["revision"] == 1
        assert call("audit_edit", {"request": {"project_id": p["id"]}})["structurally_valid"] is False
        assert (
            call("get_work_status", {"request": {"job_ids": ["absent"]}})["items"][0]["status"] == "not_found"
        )
        result = call(
            "apply_operations",
            {
                "project_id": p["id"],
                "compact": True,
                "request": {
                    "expected_revision": 1,
                    "dry_run": True,
                    "operations": [
                        {"type": "add_clip", "payload": {"track_id": "titles", "clip": {"text": "Hello"}}}
                    ],
                },
            },
        )
        assert result["confirmed_revision"] == 1 and "tracks" not in result["project"]
