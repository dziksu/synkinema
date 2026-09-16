"""Exercise the documented Script workflow across actual MCP transport, CLI and REST."""

import base64
import io
import json
import re
import wave

from fastapi.testclient import TestClient
from synkinema.agent_reference import agent_guide
from synkinema.app import create_app
from synkinema.cli import build_parser, dispatch
from synkinema.voices import Voices


def test_documented_mcp_and_cli_script_roundtrip(tmp_path, monkeypatch):
    guide = (
        agent_guide()
        .split("## Script studio: lines and audio takes", 1)[1]
        .split("## Render, inspect, revise", 1)[0]
    )
    examples = [json.loads(text) for text in re.findall(r"```json\n(.*?)\n```", guide, re.DOTALL)]
    assert len(examples) == 2
    app = create_app(tmp_path / "data", start_worker=False)
    with TestClient(app) as client:

        def rpc(method, params):
            response = client.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            )
            assert response.status_code == 200, response.text
            return response.json()["result"]

        def call(name, arguments, error=False):
            result = rpc("tools/call", {"name": name, "arguments": arguments})
            assert bool(result.get("isError")) == error, result
            if error:
                return result
            return result.get("structuredContent") or json.loads(result["content"][0]["text"])

        tools = {tool["name"]: tool for tool in rpc("tools/list", {})["tools"]}
        for name in ("get_project", "apply_operation", "generate_voice_take", "import_asset"):
            assert "script_lines" in tools[name]["description"], name
        initial = rpc(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "script-contract", "version": "1"},
            },
        )
        assert "script_lines" in initial["instructions"]
        schema = call("get_operation_reference", {"operation": "update_project"})
        assert "script_lines" in schema["payload_schema"]["properties"]
        p = call("create_project", {"name": "Script MCP/CLI QA"})
        examples[0]["project_id"] = p["id"]
        p = call("apply_operation", examples[0])
        assert p["script"] == "One line, one audio take.\nKeep your own voice."
        context = call("get_edit_context", {"request": {"project_id": p["id"]}})
        assert "script_lines" not in context and "script_lines" in context["omitted"]
        audio = io.BytesIO()
        with wave.open(audio, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(16000)
            output.writeframes(b"\x00\x00" * 16000)
        asset = call(
            "import_asset",
            {
                "filename": "test-take.wav",
                "project_id": p["id"],
                "data_base64": base64.b64encode(audio.getvalue()).decode(),
            },
        )
        assert asset["kind"] == "audio" and asset["duration_ms"] == 1000
        assert p["id"] in asset["locations"] and "library" not in asset["locations"]
        captured = []

        async def generate(self, request):
            # Provider inference is tested separately; both transports must pass
            # the typed request and expose only a real, already imported asset.
            captured.append(request)
            return {"asset": asset, "cached": True}

        monkeypatch.setattr(Voices, "generate", generate)
        request = {
            "project_id": p["id"],
            "text": p["script_lines"][0]["text"],
            "provider": "supertonic",
            "language": "en",
            "voice_id": "F1",
        }
        take = call("generate_voice_take", {"request": request})
        assert take["asset"]["id"] == asset["id"]
        assert call("get_project", {"project_id": p["id"]})["revision"] == p["revision"]
        examples[1]["project_id"] = p["id"]
        examples[1]["operation"]["payload"]["script_lines"][0]["audio_asset_id"] = asset["id"]
        p = call("apply_operation", examples[1])
        assert p["script_lines"][0]["audio_text"] == request["text"]
        assert client.get("/api/projects/" + p["id"]).json()["script_lines"] == p["script_lines"]

        # The CLI consumes the inner envelopes, exactly as the guide states.
        voice_file = tmp_path / "voice-request.json"
        voice_file.write_text(json.dumps(request))
        cli_request = build_parser().parse_args(
            [
                "request",
                "POST",
                "/api/voices/generate",
                "--json-file",
                str(voice_file),
            ]
        )
        assert dispatch(client, cli_request).json()["asset"]["id"] == asset["id"]
        assert len(captured) == 2 and all(r.project_id == p["id"] for r in captured)
        lines = list(reversed(p["script_lines"]))
        lines[1]["text"] = "Changed text; keep the original take for review."
        edit_file = tmp_path / "script-edit.json"
        edit_file.write_text(
            json.dumps(
                {
                    "expected_revision": p["revision"],
                    "type": "update_project",
                    "payload": {"script_lines": lines},
                }
            )
        )
        cli_edit = build_parser().parse_args(["edit", p["id"], str(edit_file)])
        updated = dispatch(client, cli_edit)
        assert updated.status_code == 200, updated.text
        p = updated.json()
        assert p["script_lines"][1]["audio_text"] == request["text"]
        assert call("get_project", {"project_id": p["id"]})["script_lines"] == lines
        # Both transports reject stale full-list writes; no retry or lost take.
        assert dispatch(client, cli_edit).status_code == 409
        call("apply_operation", examples[1], error=True)
        assert call("get_project", {"project_id": p["id"]})["script_lines"] == lines
        compact = call(
            "apply_operations",
            {
                "project_id": p["id"],
                "compact": True,
                "request": {
                    "expected_revision": p["revision"],
                    "operations": [{"type": "update_project", "payload": {"script_lines": lines}}],
                },
            },
        )
        assert compact["committed"] and compact["confirmed_revision"] == p["revision"] + 1
        assert all(not track["clips"] for track in p["tracks"])
        assert call("get_asset_usage", {"asset_id": asset["id"]})["can_delete"] is False
