import io
import json
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from synkinema.app import create_app
from synkinema.cli import build_parser, dispatch


def setup_take(client, shared=False):
    p = client.post("/api/projects", json={"name": "Remove audio QA"}).json()
    stream = io.BytesIO()
    with wave.open(stream, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b"\x01\x00" * 16000)
    a = client.post(
        "/api/assets",
        files={"file": ("take.wav", stream.getvalue(), "audio/wav")},
        data={} if shared else {"project_id": p["id"]},
    ).json()
    line = {
        "id": "one",
        "text": "Keep the words.",
        "audio_asset_id": a["id"],
        "audio_text": "Keep the words.",
        "audio_source": "recorded",
    }
    p = client.post(
        f"/api/projects/{p['id']}/operations",
        json={
            "expected_revision": 1,
            "type": "update_project",
            "payload": {"script_lines": [line], "asset_ids": [a["id"]]},
        },
    ).json()
    return p, a


def remove(client, p, a, **changes):
    return client.request(
        "DELETE",
        f"/api/projects/{p['id']}/script-lines/one/audio",
        json={
            "expected_revision": p["revision"],
            "expected_version": a["version"],
            "audio_asset_id": a["id"],
            **changes,
        },
    )


def test_remove_deletes_source_sidecars_and_scrubs_only_take_history(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        p, a = setup_take(client)
        path = tmp_path / a["path"]
        sidecar = tmp_path / "cache" / f"{a['id']}-waveform.png"
        sidecar.write_bytes(b"waveform")
        assert path.exists()
        result = remove(client, p, a)
        assert result.status_code == 200, result.text
        result = result.json()
        assert result["asset_ids"] == [a["id"]] and result["retained_asset_id"] is None
        assert result["deleted_files"] >= 2 and result["pending_files"] == 0
        assert not path.exists() and not sidecar.exists()
        assert client.get(f"/api/assets?project_id={p['id']}").json() == []
        assert client.get(f"/api/assets/{a['id']}/usage").status_code == 404
        updated = result["project"]
        assert updated["revision"] == 3 and updated["script"] == p["script"]
        assert updated["tracks"] == p["tracks"] and updated["asset_ids"] == []
        assert updated["script_lines"][0]["audio_asset_id"] is None
        restored = client.post(
            f"/api/projects/{p['id']}/operations",
            json={"expected_revision": 3, "type": "restore_revision", "payload": {"revision": 2}},
        )
        assert restored.status_code == 200, restored.text
        assert restored.json()["script_lines"] == updated["script_lines"]


@pytest.mark.parametrize(
    "changes", [{"expected_revision": 1}, {"expected_version": 99}, {"audio_asset_id": "different"}]
)
def test_conflicts_do_not_detach_or_delete(tmp_path, changes):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        p, a = setup_take(client)
        assert remove(client, p, a, **changes).status_code == 409
        assert (tmp_path / a["path"]).exists()
        assert client.get(f"/api/projects/{p['id']}").json() == p


@pytest.mark.parametrize("shared", [True, False])
def test_other_collections_and_cloned_project_history_keep_their_files(tmp_path, shared):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        p, a = setup_take(client, shared)
        if not shared:
            clone = client.post(
                f"/api/projects/{p['id']}/clone", json={"name": "Other project", "revision": p["revision"]}
            )
            assert clone.status_code in (200, 201), clone.text
            clone = clone.json()
        result = remove(client, p, a)
        assert result.status_code == 200, result.text
        assert result.json()["retained_asset_id"] == a["id"] and result.json()["asset_ids"] == []
        assert (tmp_path / a["path"]).exists()
        assert client.get(f"/api/assets?project_id={p['id']}").json() == []
        scope = "" if shared else f"?project_id={clone['id']}"
        assert any(item["id"] == a["id"] for item in client.get("/api/assets" + scope).json())
        if not shared:
            assert (
                client.get(f"/api/projects/{clone['id']}").json()["script_lines"][0]["audio_asset_id"]
                == a["id"]
            )


@pytest.mark.parametrize("dependency", ["line", "timeline"])
def test_current_and_historical_dependencies_block_atomically(tmp_path, dependency):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        p, a = setup_take(client)
        original_lines = p["script_lines"]
        if dependency == "line":
            operation = {
                "type": "update_project",
                "payload": {"script_lines": [*original_lines, {**original_lines[0], "id": "two"}]},
            }
        else:
            track = next(t for t in p["tracks"] if t["kind"] == "voiceover")
            operation = {
                "type": "add_clip",
                "payload": {"track_id": track["id"], "clip": {"asset_id": a["id"], "duration_ms": 1000}},
            }
        response = client.post(
            f"/api/projects/{p['id']}/operations", json={"expected_revision": p["revision"], **operation}
        )
        assert response.status_code == 200, response.text
        p = response.json()
        assert remove(client, p, a).status_code == 409
        restored = client.post(
            f"/api/projects/{p['id']}/operations",
            json={"expected_revision": p["revision"], "type": "restore_revision", "payload": {"revision": 2}},
        ).json()
        assert remove(client, restored, a).status_code == 409
        assert (tmp_path / a["path"]).exists()
        assert client.get(f"/api/projects/{p['id']}?revision=2").json()["script_lines"] == original_lines


def test_failed_unlink_is_durable_and_not_reported_as_deleted(tmp_path, monkeypatch):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        p, a = setup_take(client)
        target = tmp_path / a["path"]
        unlink = Path.unlink

        def fail(path, *args, **kwargs):
            if path == target:
                raise PermissionError("busy")
            return unlink(path, *args, **kwargs)

        monkeypatch.setattr(Path, "unlink", fail)
        result = remove(client, p, a).json()
        assert result["pending_files"] == 1 and target.exists()
        assert result["project"]["script_lines"][0]["audio_asset_id"] is None
        monkeypatch.setattr(Path, "unlink", unlink)
        response = client.post("/api/storage/cleanup")
        assert response.status_code == 200, response.text
        assert response.json()["pending_files"] == 0 and not target.exists()


@pytest.mark.parametrize("transport", ["mcp", "cli"])
def test_agent_removal_uses_the_same_guarded_contract(tmp_path, transport):
    with TestClient(create_app(tmp_path / "data", start_worker=False)) as client:
        p, a = setup_take(client)
        request = {
            "expected_revision": p["revision"],
            "expected_version": a["version"],
            "audio_asset_id": a["id"],
        }
        if transport == "mcp":
            response = client.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {
                        "name": "remove_script_audio",
                        "arguments": {"project_id": p["id"], "line_id": "one", "request": request},
                    },
                },
            )
            result = response.json()["result"]
            assert not result.get("isError"), result
            result = result.get("structuredContent") or json.loads(result["content"][0]["text"])
        else:
            path = tmp_path / "remove-take.json"
            path.write_text(json.dumps(request))
            args = build_parser().parse_args(
                [
                    "request",
                    "DELETE",
                    f"/api/projects/{p['id']}/script-lines/one/audio",
                    "--json-file",
                    str(path),
                ]
            )
            response = dispatch(client, args)
            assert response.status_code == 200, response.text
            result = response.json()
        assert result["asset_ids"] == [a["id"]]
        assert result["project"]["revision"] == p["revision"] + 1
        assert not (tmp_path / "data" / a["path"]).exists()
