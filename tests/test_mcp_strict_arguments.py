"""Unknown MCP arguments fail loudly with a correction instead of being ignored."""

import json

import pytest
from fastapi.testclient import TestClient
from synkinema.app import create_app


@pytest.fixture
def rpc(tmp_path):
    app = create_app(tmp_path / "mcp", start_worker=False)
    with TestClient(app) as c:

        def call(method, params=None):
            response = c.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
            )
            assert response.status_code == 200, response.text
            return response.json()["result"]

        call(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "strict-test", "version": "1"},
            },
        )
        yield call


def text(result):
    return next(block["text"] for block in result["content"] if block["type"] == "text")


def test_every_tool_schema_forbids_additional_properties(rpc):
    tools = rpc("tools/list")["tools"]
    assert tools
    assert all(t["inputSchema"].get("additionalProperties") is False for t in tools)


def test_guessed_parameter_names_are_rejected_with_the_real_name(rpc):
    result = rpc("tools/call", {"name": "search_assets", "arguments": {"term": "music"}})
    assert result["isError"] is True
    message = text(result)
    assert "Unknown parameter for search_assets: 'term'" in message
    assert "Did you mean 'query'?" in message
    assert "nothing was executed" in message

    result = rpc(
        "tools/call",
        {"name": "render_frames", "arguments": {"project_id": "missing", "times_ms": [1000]}},
    )
    assert result["isError"] is True
    assert "Did you mean 'timestamps_ms'?" in text(result)

    result = rpc(
        "tools/call",
        {"name": "get_render_progress", "arguments": {"job_idd": "x"}},
    )
    assert "Did you mean 'job_id'?" in text(result)


def test_top_level_field_of_a_nested_request_points_inside_it(rpc):
    result = rpc(
        "tools/call",
        {
            "name": "apply_operations",
            "arguments": {
                "project_id": "missing",
                "expected_revision": 1,
                "request": {"expected_revision": 1, "operations": [], "dry_run": True},
            },
        },
    )
    assert result["isError"] is True
    assert "'expected_revision'. It belongs inside 'request'." in text(result)


def test_valid_calls_and_json_encoded_arguments_still_work(rpc):
    result = rpc("tools/call", {"name": "get_operation_reference", "arguments": {"operation": "trim_clip"}})
    assert not result.get("isError")
    created = rpc("tools/call", {"name": "create_project", "arguments": {"name": "Strict"}})
    project = created.get("structuredContent") or json.loads(text(created))
    assert project["revision"] == 1
    # FastMCP pre-parses JSON strings for model-typed parameters; strictness must not break that.
    result = rpc(
        "tools/call",
        {
            "name": "get_edit_context",
            "arguments": {"request": json.dumps({"project_id": project["id"], "limit": 5})},
        },
    )
    assert not result.get("isError"), text(result)
