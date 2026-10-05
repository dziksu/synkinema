import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

assert "SYNKINEMA_API_TOKEN" not in os.environ
url, thread = "", "fake-thread"


def emit(event):
    data = (json.dumps(event, ensure_ascii=False) + "\n").encode()
    for byte in data:
        sys.stdout.buffer.write(bytes([byte]))
    sys.stdout.buffer.flush()


def reply(id, result):
    emit({"id": id, "result": result})


def rpc(method, params=None):
    request = urllib.request.Request(
        url,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)["result"]


if "--print" in sys.argv:
    text = sys.stdin.read()
    if "FAIL" in text:
        emit({"type": "result", "is_error": True, "result": '{"error":{"message":"Login required"}}'})
    else:
        emit({"type": "stream_event", "event": {"type": "message_start", "message": {"id": "a"}}})
        emit(
            {
                "type": "stream_event",
                "event": {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "Claude reply"},
                },
            }
        )
        emit({"type": "result", "result": "Claude reply"})
    sys.exit(0)
if "--prompt" in sys.argv:
    emit({"type": "assistant.message_delta", "data": {"messageId": "a", "deltaContent": "Copilot reply"}})
    emit({"type": "assistant.message", "data": {"messageId": "a", "content": "Copilot reply"}})
    sys.exit(0)
for line in sys.stdin:
    event = json.loads(line)
    method, id = event.get("method"), event.get("id")
    if method == "initialize":
        reply(id, {"userAgent": "fake"})
    elif method == "config/read":
        reply(
            id,
            {
                "config": {
                    "mcp_servers": {"unrelated": {"command": "secret", "args": None}},
                    "plugins": {"test": {"enabled": True, "value": None}},
                }
            },
        )
    elif method == "model/list":
        assert "thread/start" not in method
        if not event["params"].get("cursor"):
            reply(
                id,
                {
                    "data": [
                        {
                            "model": "fixture-model",
                            "displayName": "Fixture",
                            "isDefault": True,
                            "supportedReasoningEfforts": [{"reasoningEffort": "high"}],
                        }
                    ],
                    "nextCursor": "page-2",
                },
            )
        else:
            reply(
                id,
                {
                    "data": [
                        {"model": "hidden", "hidden": True},
                        {
                            "model": "manual",
                            "displayName": "Manual",
                            "isDefault": False,
                            "supportedReasoningEfforts": [],
                        },
                    ],
                    "nextCursor": None,
                },
            )
    elif method == "thread/start":
        config = event["params"]["config"]
        assert not config["mcp_servers"]["unrelated"]["enabled"]
        assert "args" not in config["mcp_servers"]["unrelated"]
        assert not config["plugins"]["test"]["enabled"]
        assert event["params"]["sandbox"] == "read-only"
        url = next(server["url"] for server in config["mcp_servers"].values() if server["enabled"])
        Path(__file__ + ".capability").write_text(url)
        reply(id, {"thread": {"id": thread}})
    elif method == "turn/start":
        prompt = event["params"]["input"][0]["text"]
        current_message = json.loads(prompt.split("Current user message (JSON):\n", 1)[1])["text"]
        rpc(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "fixture", "version": "1"},
            },
        )
        tools = {tool["name"] for tool in rpc("tools/list")["tools"]}
        project_id = prompt.split("Conversation project ID: ")[1].split("\n")[0]
        if "EDIT" in current_message:
            assert "apply_batch" in tools
            project = json.loads(
                rpc("tools/call", {"name": "get_project", "arguments": {"project_id": project_id}})[
                    "content"
                ][0]["text"]
            )
            result = rpc(
                "tools/call",
                {
                    "name": "apply_batch",
                    "arguments": {
                        "project_id": project_id,
                        "request": {
                            "expected_revision": project["revision"],
                            "operations": [{"type": "update_project", "payload": {"name": "Agent edited"}}],
                        },
                    },
                },
            )
            assert not result.get("isError"), result
            stale = rpc(
                "tools/call",
                {
                    "name": "apply_batch",
                    "arguments": {
                        "project_id": project_id,
                        "request": {
                            "expected_revision": project["revision"],
                            "operations": [{"type": "update_project", "payload": {"name": "Must not write"}}],
                        },
                    },
                },
            )
            assert stale.get("isError"), stale
        else:
            assert "apply_batch" not in tools
        reply(id, {"turn": {"id": "turn"}})
        emit(
            {
                "method": "item/agentMessage/delta",
                "params": {"threadId": thread, "itemId": "a", "delta": "Cześć 🌍"},
            }
        )
        if "STOP" in current_message:
            child = subprocess.Popen(
                [sys.executable, "-c", "import time; time.sleep(60)"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            Path(__file__ + ".child").write_text(str(child.pid))
            time.sleep(60)
        emit(
            {
                "method": "item/completed",
                "params": {
                    "threadId": thread,
                    "item": {"type": "agentMessage", "id": "a", "text": "Cześć 🌍"},
                },
            }
        )
        emit({"method": "turn/completed", "params": {"threadId": thread, "turn": {"status": "completed"}}})
