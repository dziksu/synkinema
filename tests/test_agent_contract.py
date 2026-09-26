"""The documentation is a discoverable, executable API contract, not a separate brochure."""

import json
import re
from typing import get_args

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from PIL import Image
from synkinema.agent_reference import REST_DESCRIPTIONS, agent_guide, operation_reference
from synkinema.app import create_app
from synkinema.models import Operation


def test_all_operation_examples_match_standalone_payload_schemas():
    reference = operation_reference()
    assert set(reference["operations"]) == set(get_args(Operation.model_fields["type"].annotation))
    for name, record in reference["operations"].items():
        assert len(record["description"]) > 70, name
        Draft202012Validator.check_schema(record["payload_schema"])
        Draft202012Validator(record["payload_schema"]).validate(record["example_payload"])
        assert operation_reference(name)["payload_schema"] == record["payload_schema"]
    with pytest.raises(ValueError, match="Unknown operation"):
        operation_reference("invented_operation")


def test_rest_documentation_covers_routes_and_resolves_openapi_refs(tmp_path):
    app = create_app(tmp_path / "api", start_worker=False)
    routes = [r for r in app.routes if isinstance(r, APIRoute)]
    assert {r.name for r in routes} == set(REST_DESCRIPTIONS)
    assert all(len(r.description) > 60 for r in routes)
    with TestClient(app) as c:
        assert c.get("/api/agent/guide").text == agent_guide()
        spec = c.get("/api/openapi.json").json()
        for ref in re.findall(r'"\$ref":\s*"(#[^"]+)"', json.dumps(spec)):
            node = spec
            for key in ref[2:].split("/"):
                node = node[key]
        assert "409" in spec["paths"]["/api/projects/{project_id}/operations"]["post"]["responses"]
        response_schema = spec["paths"]["/api/projects"]["post"]["responses"]["201"]["content"][
            "application/json"
        ]["schema"]
        snapshot = spec["components"]["schemas"][response_schema["$ref"].rsplit("/", 1)[1]]
        assert "duration_ms" in snapshot["required"]
        assert len(c.get("/api/schema/operations").json()["operations"]) == 16
        assert (
            c.get("/api/schema/operations", params={"operation": "move_clip"}).json()["operation"]
            == "move_clip"
        )
        assert c.get("/api/schema/operations", params={"operation": "invented"}).status_code == 422
        caps = c.get("/api/capabilities").json()
        assert caps["effect_bounds"]["blur"] == [0, 30]
        assert caps["animation_bounds"]["gain_db"] == [-60, 12]


def test_mcp_discovery_resources_errors_and_documented_mutation(tmp_path):
    app = create_app(tmp_path / "mcp", start_worker=False)
    with TestClient(app) as c:

        def rpc(method, params=None):
            response = c.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
            )
            assert response.status_code == 200, response.text
            return response.json()["result"]

        init = rpc(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "contract-test", "version": "1"},
            },
        )
        assert "get_agent_guide" in init["instructions"]
        listing = rpc("tools/list")["tools"]
        tools = {t["name"]: t for t in listing}
        assert len(tools) == 78  # + list/get/restore_channel_version
        assert tools["remove_script_audio"]["annotations"]["destructiveHint"] is True
        for tool in tools.values():
            assert len(tool["description"]) > 70, tool["name"]
            assert "annotations" in tool
            for parameter, schema in tool["inputSchema"].get("properties", {}).items():
                assert "$ref" in schema or schema.get("description"), (
                    tool["name"],
                    parameter,
                )
        assert tools["generate_voice_take"]["annotations"]["openWorldHint"] is True
        assert set(tools["start_render"]["inputSchema"]["properties"]["quality"]["enum"]) == {
            "preview",
            "final",
        }
        assert tools["render_frames"]["annotations"]["readOnlyHint"] is False  # May write preview/cache.
        assert tools["get_agent_guide"]["annotations"]["readOnlyHint"] is True
        resources = rpc("resources/list")["resources"]
        assert {r["uri"] for r in resources} == {"synkinema://agent-guide", "synkinema://operations"}
        guide = rpc("resources/read", {"uri": "synkinema://agent-guide"})["contents"][0]["text"]
        assert guide == agent_guide()
        reference = rpc(
            "tools/call", {"name": "get_operation_reference", "arguments": {"operation": "trim_clip"}}
        )
        assert not reference.get("isError")

        def data(result):
            return result.get("structuredContent") or json.loads(
                next(block["text"] for block in result["content"] if block["type"] == "text")
            )

        assert data(reference)["operation"] == "trim_clip"
        p = data(rpc("tools/call", {"name": "create_project", "arguments": {"name": "Contract test"}}))
        assert p["duration_ms"] == 0 and p["revision"] == 1
        body = {
            "project_id": p["id"],
            "operation": {
                "expected_revision": 1,
                "type": "add_clip",
                "payload": {"track_id": "titles", "clip": {"text": "Agent example", "duration_ms": 3000}},
            },
        }
        result = data(rpc("tools/call", {"name": "apply_operation", "arguments": body}))
        assert result["duration_ms"] == 3000 and result["revision"] == 2
        assert rpc("tools/call", {"name": "apply_operation", "arguments": body})["isError"] is True
        assert c.get(f"/api/projects/{p['id']}").json()["revision"] == 2
        cleared = data(
            rpc(
                "tools/call",
                {
                    "name": "delete_render_jobs",
                    "arguments": {"request": {"project_id": p["id"], "status": "finished"}},
                },
            )
        )
        assert cleared["job_ids"] == [] and cleared["pending_files"] == 0
        deleted = data(
            rpc(
                "tools/call",
                {"name": "delete_project", "arguments": {"project_id": p["id"], "expected_revision": 2}},
            )
        )
        assert deleted["project_ids"] == [p["id"]]
        assert c.get(f"/api/projects/{p['id']}").status_code == 404
        assert data(rpc("tools/call", {"name": "retry_file_cleanup"}))["pending_files"] == 0


def test_operation_examples_execute_with_documented_context(tmp_path):
    app = create_app(tmp_path / "examples", start_worker=False)
    image = tmp_path / "frame.png"
    Image.new("RGB", (160, 160), "green").save(image)
    with TestClient(app) as c:
        with image.open("rb") as f:
            asset = c.post("/api/assets", files={"file": ("frame.png", f, "image/png")}).json()
        p = c.post("/api/projects", json={"name": "Examples"}).json()
        references = operation_reference()["operations"]
        executed = set()

        def edit(name, payload=None):
            nonlocal p
            payload = payload if payload is not None else references[name]["example_payload"]
            payload = json.loads(json.dumps(payload).replace("ASSET_ID", asset["id"]))
            Draft202012Validator(references[name]["payload_schema"]).validate(payload)
            response = c.post(
                f"/api/projects/{p['id']}/operations",
                json={"expected_revision": p["revision"], "type": name, "payload": payload},
            )
            assert response.status_code == 200, (name, response.text)
            p = response.json()
            executed.add(name)

        edit("update_project")
        edit("add_track")
        edit("reorder_tracks")
        edit("update_track")
        edit("add_clip")
        edit("update_clip")
        edit("move_clip")  # start=1000
        edit("trim_clip")  # image allows source offset, duration=3000
        edit("split_clip")  # two 1000/2000ms pieces, left retains ID
        edit("remove_clip")
        # Use the remaining right part as predecessor; reference transition needs a next clip.
        previous = p["tracks"][0]["clips"][0]
        edit(
            "add_clip",
            {
                "track_id": "video",
                "clip": {
                    "id": "clip_video",
                    "asset_id": asset["id"],
                    "start_ms": previous["start_ms"] + previous["duration_ms"],
                    "duration_ms": 4000,
                },
            },
        )
        edit("set_transition")
        edit("remove_track")
        edit("restore_revision")
        assert executed == set(references) - {"append_clip", "duplicate_clip", "extract_audio"}
        assert p["name"] == "Examples" and p["duration_ms"] == 0
