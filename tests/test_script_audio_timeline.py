"""Line regeneration preserves editability and replaces actual timeline narration."""

import io
import json
import wave

import pytest
from fastapi.testclient import TestClient
from synkinema.app import create_app
from synkinema.models import Clip, Project, Scene, ScriptLine, Track


@pytest.fixture
def narrated(tmp_path):
    app = create_app(tmp_path / "data", start_worker=False)
    service = app.state.service
    assets = []
    for i, duration in enumerate([1000, 700, 2200]):
        data = io.BytesIO()
        with wave.open(data, "wb") as audio:
            audio.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            audio.writeframes(b"\0\0" * (duration * 16))
        path = tmp_path / f"take-{i}.wav"
        path.write_bytes(data.getvalue())
        assets.append(service.import_file(path))
    first = ScriptLine(
        id="first", text="Hello", audio_text="Hello", audio_source="generated", audio_asset_id=assets[0]["id"]
    )
    project = service.create(
        Project(
            name="Editable narrator",
            script_lines=[first],
            tracks=[
                Track(
                    id="voice",
                    name="Voice",
                    kind="voiceover",
                    clips=[
                        Clip(
                            id="take",
                            name="Hello",
                            asset_id=assets[0]["id"],
                            start_ms=100,
                            duration_ms=1000,
                            gain_db=-4,
                            fade_out_ms=800,
                        ),
                        Clip(id="later", asset_id=assets[1]["id"], start_ms=1800, duration_ms=700),
                    ],
                ),
                Track(
                    id="captions",
                    name="Captions",
                    kind="text",
                    clips=[Clip(id="caption", text="Hello", start_ms=100, duration_ms=1000)],
                ),
            ],
            scenes=[Scene(id="first", title="First", narration="Hello", voice_asset_id=assets[0]["id"])],
        )
    )
    with TestClient(app) as client:
        yield client, service, project, assets
    service.store.engine.dispose()


def replacement(project, asset, revision=1):
    line = project.script_lines[0].model_dump()
    line.update(text="New words", audio_text="New words", audio_asset_id=asset["id"])
    return {"expected_revision": revision, "type": "update_project", "payload": {"script_lines": [line]}}


def test_take_replacement_is_atomic_and_undoable(narrated):
    client, service, project, assets = narrated
    endpoint = f"/api/projects/{project.id}/operations"
    changed = client.post(endpoint, json=replacement(project, assets[1]))
    assert changed.status_code == 200, changed.text
    saved = changed.json()
    clip = saved["tracks"][0]["clips"][0]
    assert (
        clip["asset_id"],
        clip["duration_ms"],
        clip["start_ms"],
        clip["gain_db"],
        clip["fade_out_ms"],
    ) == (assets[1]["id"], 700, 100, -4, 700)
    assert saved["tracks"][0]["clips"][1] == project.tracks[0].clips[1].model_dump()
    assert saved["tracks"][1] == project.tracks[1].model_dump()
    assert saved["scenes"][0]["voice_asset_id"] == assets[1]["id"]
    assert saved["scenes"][0]["narration"] == "New words"
    assert client.post(endpoint, json=replacement(project, assets[2])).status_code == 409
    assert service.get(project.id).revision == 2
    restored = client.post(
        endpoint, json={"expected_revision": 2, "type": "restore_revision", "payload": {"revision": 1}}
    ).json()
    assert restored["script_lines"] == [line.model_dump() for line in project.script_lines]
    assert restored["tracks"] == [t.model_dump() for t in project.tracks]


def test_longer_take_collision_rolls_back_script_and_timeline(narrated):
    client, service, project, assets = narrated
    failed = client.post(f"/api/projects/{project.id}/operations", json=replacement(project, assets[2]))
    assert failed.status_code == 422, failed.text
    assert service.get(project.id) == project
    assert len(service.history(project.id)) == 1


def test_swapping_two_line_takes_does_not_cascade_to_the_other_clip(narrated):
    client, _, project, assets = narrated
    endpoint = f"/api/projects/{project.id}/operations"
    first = project.script_lines[0].model_dump()
    second = {
        "id": "second",
        "text": "Second",
        "audio_text": "Second",
        "audio_source": "generated",
        "audio_asset_id": assets[1]["id"],
    }
    attached = client.post(
        endpoint,
        json={"expected_revision": 1, "type": "update_project", "payload": {"script_lines": [first, second]}},
    )
    assert attached.status_code == 200
    swapped = client.post(
        endpoint,
        json={
            "expected_revision": 2,
            "type": "update_project",
            "payload": {
                "script_lines": [
                    {**first, "audio_asset_id": assets[1]["id"]},
                    {**second, "audio_asset_id": assets[0]["id"]},
                ]
            },
        },
    )
    assert swapped.status_code == 200, swapped.text
    assert [c["asset_id"] for c in swapped.json()["tracks"][0]["clips"]] == [assets[1]["id"], assets[0]["id"]]
    assert swapped.json()["scenes"][0]["voice_asset_id"] == assets[1]["id"]


@pytest.mark.parametrize("kind", ["trimmed", "shared"])
def test_ambiguous_or_trimmed_take_requires_explicit_edit(narrated, kind):
    client, service, project, assets = narrated
    from synkinema.models import Operation

    if kind == "trimmed":
        current = service.apply(
            project.id,
            Operation(
                expected_revision=1,
                type="trim_clip",
                payload={
                    "track_id": "voice",
                    "clip_id": "take",
                    "changes": {"source_in_ms": 100, "duration_ms": 800},
                },
            ),
        )
    else:
        current = service.apply(
            project.id,
            Operation(
                expected_revision=1,
                type="update_project",
                payload={
                    "script_lines": [
                        project.script_lines[0].model_dump(),
                        {**project.script_lines[0].model_dump(), "id": "shared"},
                    ]
                },
            ),
        )
    request = replacement(current, assets[1], current.revision)
    if kind == "shared":
        request["payload"]["script_lines"].append(current.script_lines[1].model_dump())
    failed = client.post(f"/api/projects/{project.id}/operations", json=request)
    assert failed.status_code == 422 and "explicitly" in failed.text
    assert service.get(project.id) == current


def test_mcp_requires_links_before_export_and_accepts_repaired_metadata(narrated):
    client, service, project, assets = narrated

    def call(name, arguments):
        return client.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            },
        ).json()["result"]

    result = call("validate_project", {"project_id": project.id})
    assert not result.get("isError"), result
    report = result.get("structuredContent") or json.loads(result["content"][0]["text"])
    assert any(
        e["code"] == "unlinked_narration" and e["asset_id"] == assets[1]["id"] for e in report["errors"]
    )
    rejected = call("start_render", {"project_id": project.id, "expected_revision": 1})
    assert rejected["isError"] and "script_lines" in json.dumps(rejected)
    assert service.jobs(project.id) == []
    lines = [
        project.script_lines[0].model_dump(),
        {
            "id": "later",
            "text": "Later",
            "audio_text": "Later",
            "audio_source": "generated",
            "audio_asset_id": assets[1]["id"],
        },
    ]
    repaired = call(
        "apply_operation",
        {
            "project_id": project.id,
            "operation": {
                "expected_revision": 1,
                "type": "update_project",
                "payload": {"script_lines": lines},
            },
        },
    )
    assert not repaired.get("isError")
    assert service.get(project.id).tracks == project.tracks
    rendered = call("start_render", {"project_id": project.id, "expected_revision": 2})
    assert not rendered.get("isError"), rendered
    assert len(service.jobs(project.id)) == 1
