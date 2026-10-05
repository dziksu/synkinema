"""Exercise actual subprocess/stdio/HTTP MCP without paid provider inference."""

import asyncio
import json
import os
import socket
import sys
import threading
import time
from pathlib import Path

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient
from mcp.server.fastmcp.exceptions import ToolError
from synkinema.app import create_app
from synkinema.chat_contract import AgentChatCreate, AgentMessage
from synkinema.chat_providers import OutputParser, json_lines
from synkinema.chat_service import ChatService
from synkinema.models import Project
from synkinema.service import Service
from synkinema.storage import Store

FAKE_CLI = (Path(__file__).parent / "fixtures/local_agent.py").read_text()


@pytest.fixture
def fake_cli(tmp_path):
    path = tmp_path / "fake-agent"
    path.write_text(f"#!{sys.executable}\n" + FAKE_CLI)
    path.chmod(0o700)
    return path


@pytest.fixture
def live_chat(tmp_path, fake_cli, monkeypatch):
    monkeypatch.setenv("SYNKINEMA_API_TOKEN", "fixture-app-token")
    app = create_app(tmp_path / "data", start_worker=False)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error", access_log=False)
    )
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    assert server.started
    with httpx.Client(
        base_url=f"http://127.0.0.1:{port}", headers={"Authorization": "Bearer fixture-app-token"}, timeout=5
    ) as client:
        settings = client.get("/api/agent-chat/settings").json()
        for config in settings["settings"]["providers"].values():
            config["executable"] = str(fake_cli)
        response = client.put(
            "/api/agent-chat/settings",
            json={"expected_version": settings["version"], "settings": settings["settings"]},
        )
        assert response.status_code == 200, response.text
        yield app, client
    server.should_exit = True
    thread.join(timeout=6)
    sock.close()
    assert not thread.is_alive()


def wait_chat(client, chat_id, predicate=lambda c: not c["running"]):
    deadline = time.monotonic() + 6
    while time.monotonic() < deadline:
        response = client.get(f"/api/agent-chat/chats/{chat_id}")
        assert response.status_code == 200, response.text
        chat = response.json()
        if predicate(chat):
            return chat
        time.sleep(0.03)
    pytest.fail(f"Chat did not settle: {chat}")


def test_real_codex_stdio_mcp_revision_conflict_and_revocation(live_chat, fake_cli):
    app, client = live_chat
    project = client.post("/api/projects", json={"name": "QA agent project"}).json()
    chat = client.post("/api/agent-chat/chats", json={"project_id": project["id"]}).json()
    chat = client.patch(
        f"/api/agent-chat/chats/{chat['id']}", json={"expected_version": chat["version"], "mode": "edit"}
    ).json()
    payload = {"text": "EDIT", "request_id": "edit-once"}
    response = client.post(f"/api/agent-chat/chats/{chat['id']}/messages", json=payload)
    assert response.status_code == 202, response.text
    final = wait_chat(client, chat["id"])
    assert final["messages"][-1]["status"] == "complete", final["messages"][-1]
    assert final["messages"][-1]["text"] == "Cześć 🌍"
    assert final["messages"][-1]["applied_revisions"] == [2]
    edited = client.get(f"/api/projects/{project['id']}").json()
    assert (edited["name"], edited["revision"]) == ("Agent edited", 2)
    duplicate = client.post(f"/api/agent-chat/chats/{chat['id']}/messages", json=payload).json()
    assert len(duplicate["messages"]) == 2
    assert not duplicate["running"]
    assert (
        client.post(
            f"/api/agent-chat/chats/{chat['id']}/messages", json={**payload, "text": "different"}
        ).status_code
        == 409
    )
    with httpx.Client() as unauthenticated:
        capability = Path(str(fake_cli) + ".capability").read_text()
        assert unauthenticated.post(capability, json={}).status_code == 404
    assert not app.state.chat.capabilities


def test_ask_stop_disconnect_and_process_cleanup(live_chat, fake_cli):
    app, client = live_chat
    chat = client.post("/api/agent-chat/chats", json={}).json()
    path = f"/api/agent-chat/chats/{chat['id']}"
    assert client.patch(path, json={"expected_version": chat["version"], "mode": "edit"}).status_code == 422
    assert client.post(path + "/messages", json={"text": "STOP", "request_id": "stop"}).status_code == 202
    partial = wait_chat(client, chat["id"], lambda c: bool(c["messages"][-1]["text"]))
    assert partial["running"] and partial["messages"][-1]["text"] == "Cześć 🌍"
    # A new browser connection sees the current run; no HTTP stream owns its lifetime.
    with httpx.Client(base_url=str(client.base_url), headers=dict(client.headers)) as reconnect:
        assert reconnect.get(path).json()["running"]
    assert (
        client.patch(path, json={"expected_version": partial["version"], "title": "busy"}).status_code == 409
    )
    assert client.delete(path, params={"expected_version": partial["version"]}).status_code == 409
    assert client.post(path + "/stop").status_code == 200
    final = wait_chat(client, chat["id"])
    assert final["messages"][-1]["status"] == "cancelled"
    assert final["messages"][-1]["text"] == "Cześć 🌍"
    assert not app.state.chat.runs and not app.state.chat.capabilities
    child_file = Path(str(fake_cli) + ".child")
    if child_file.exists() and os.name == "posix":
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            try:
                os.kill(int(child_file.read_text()), 0)
            except ProcessLookupError:
                break
            time.sleep(0.02)
        else:
            pytest.fail("Agent descendant survived Stop")


@pytest.mark.parametrize("provider,reply", [("claude", "Claude reply"), ("copilot", "Copilot reply")])
def test_provider_switches_use_history_and_real_process(live_chat, provider, reply):
    _, client = live_chat
    chat = client.post("/api/agent-chat/chats", json={"provider": provider}).json()
    path = f"/api/agent-chat/chats/{chat['id']}"
    assert client.post(path + "/messages", json={"text": "Hello", "request_id": "one"}).status_code == 202
    final = wait_chat(client, chat["id"])
    assert final["messages"][-1]["status"] == "complete", final
    assert final["messages"][-1]["text"] == reply
    switched = client.patch(path, json={"expected_version": final["version"], "provider": "codex"}).json()
    assert len(switched["messages"]) == 2
    assert client.post(path + "/messages", json={"text": "Continue", "request_id": "two"}).status_code == 202
    final = wait_chat(client, chat["id"])
    assert len(final["messages"]) == 4
    assert final["messages"][-1]["status"] == "complete", final


def test_catalog_and_provider_error(live_chat):
    _, client = live_chat
    catalog = client.get("/api/agent-chat/codex/models")
    assert catalog.status_code == 200, catalog.text
    assert [m["id"] for m in catalog.json()] == ["fixture-model", "manual"]
    chat = client.post("/api/agent-chat/chats", json={"provider": "claude"}).json()
    assert (
        client.post(
            f"/api/agent-chat/chats/{chat['id']}/messages", json={"text": "FAIL", "request_id": "fail"}
        ).status_code
        == 202
    )
    final = wait_chat(client, chat["id"])
    assert final["messages"][-1]["status"] == "failed"
    assert "Login required" in final["messages"][-1]["error"]


def test_concurrency_limit_archive_context_and_prompt_validation(live_chat):
    _, client = live_chat
    chats = [client.post("/api/agent-chat/chats", json={}).json() for _ in range(4)]
    for index, chat in enumerate(chats[:3]):
        response = client.post(
            f"/api/agent-chat/chats/{chat['id']}/messages", json={"text": "STOP", "request_id": str(index)}
        )
        assert response.status_code == 202, response.text
    first_path = f"/api/agent-chat/chats/{chats[0]['id']}"
    assert (
        client.post(first_path + "/messages", json={"text": "Another", "request_id": "busy"}).status_code
        == 409
    )
    idle_path = f"/api/agent-chat/chats/{chats[3]['id']}"
    assert (
        client.post(idle_path + "/messages", json={"text": "Fourth", "request_id": "four"}).status_code == 409
    )
    for chat in chats[:3]:
        client.post(f"/api/agent-chat/chats/{chat['id']}/stop")
        assert wait_chat(client, chat["id"])["messages"][-1]["status"] == "cancelled"
    assert (
        client.post(idle_path + "/messages", json={"text": "x" * 20001, "request_id": "limit"}).status_code
        == 422
    )
    assert client.post(idle_path + "/messages", json={"text": " ", "request_id": "blank"}).status_code == 422
    assert (
        client.post(
            idle_path + "/messages",
            json={
                "text": "Context",
                "request_id": "context",
                "context": {"type": "clip", "target_id": "foreign"},
            },
        ).status_code
        == 422
    )
    assert (
        client.patch(
            idle_path, json={"expected_version": chats[3]["version"], "project_id": "cannot-reassign"}
        ).status_code
        == 422
    )
    archived = client.patch(
        idle_path, json={"expected_version": chats[3]["version"], "archived": True}
    ).json()
    assert (
        client.post(idle_path + "/messages", json={"text": "Archived", "request_id": "archive"}).status_code
        == 422
    )
    restored = client.patch(
        idle_path, json={"expected_version": archived["version"], "archived": False}
    ).json()
    deleted = client.delete(idle_path, params={"expected_version": restored["version"]})
    assert deleted.status_code == 200 and deleted.json() == {"chat_id": chats[3]["id"], "deleted": True}
    assert client.get(idle_path).status_code == 404


def test_timeout_reaps_process_and_preserves_failure(live_chat, monkeypatch):
    from synkinema import chat_service

    monkeypatch.setattr(chat_service, "TURN_TIMEOUT_SECONDS", 0.5)
    app, client = live_chat
    chat = client.post("/api/agent-chat/chats", json={}).json()
    assert (
        client.post(
            f"/api/agent-chat/chats/{chat['id']}/messages", json={"text": "STOP", "request_id": "timeout"}
        ).status_code
        == 202
    )
    final = wait_chat(client, chat["id"])
    assert final["messages"][-1]["status"] == "failed"
    assert "time limit" in final["messages"][-1]["error"]
    assert not app.state.chat.runs and not app.state.chat.capabilities


@pytest.mark.asyncio
async def test_stop_before_task_start_and_read_only_policy(tmp_path, fake_cli, monkeypatch):
    from synkinema.chat_contract import AgentChatUpdate, AgentSend, AgentSettingsUpdate

    monkeypatch.setenv("SYNKINEMA_AGENT_CHAT_READ_ONLY", "true")
    domain = Service(Store(tmp_path / "policy"))
    service = ChatService(domain)
    settings = service.settings()
    settings.settings.providers.codex.executable = str(fake_cli)
    service.update_settings(
        AgentSettingsUpdate(expected_version=settings.version, settings=settings.settings)
    )
    project = domain.create(Project(name="QA read only"))
    chat = await service.create(AgentChatCreate(project_id=project.id))
    with pytest.raises(ValueError, match="write policy"):
        service.update(chat.id, AgentChatUpdate(expected_version=chat.version, mode="edit"))
    await service.send(chat.id, AgentSend(text="Hello", request_id="immediate"), "http://127.0.0.1:1")
    task = service.runs[chat.id].task
    await service.stop(chat.id)
    await task
    assert service.get(chat.id).messages[-1].status == "cancelled"
    assert not service.get(chat.id).running and not service.capabilities
    assert not Path(str(fake_cli) + ".capability").exists()
    await service.close()
    domain.store.engine.dispose()


def test_redacts_capability_access_logs():
    import logging

    from synkinema.chat_routes import CapabilityRedaction

    secret = "a" * 32
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 1, "%s %s", ("POST", f"/api/agent-chat/mcp/{secret}/"), None
    )
    CapabilityRedaction().filter(record)
    assert secret not in record.getMessage()
    assert "[capability]" in record.getMessage()


@pytest.mark.asyncio
async def test_persistence_archive_filtered_order_and_version_guards(tmp_path):
    domain = Service(Store(tmp_path))
    chats = ChatService(domain)
    first, hidden, third = [await chats.create(AgentChatCreate()) for _ in range(3)]
    from synkinema.chat_contract import AgentChatOrder, AgentChatUpdate

    chats.order(AgentChatOrder(chat_ids=[first.id, third.id]))
    assert [c.id for c in chats.summaries()] == [first.id, hidden.id, third.id]
    chat = chats.update(
        first.id, AgentChatUpdate(expected_version=first.version, title="Renamed", archived=True)
    )
    from synkinema.service import Conflict

    with pytest.raises(Conflict):
        chats.update(chat.id, AgentChatUpdate(expected_version=first.version, title="Stale"))
    with pytest.raises(ValueError):
        AgentChatOrder(chat_ids=[first.id, first.id])
    chat.messages.append(
        AgentMessage(
            id="orphan",
            role="assistant",
            provider="codex",
            status="running",
            text="Partial",
            created_at=chat.created_at,
        )
    )
    chats.chats[chat.id] = chat
    chats.save(chat)
    recovered = ChatService(domain).get(chat.id)
    assert recovered.title == "Renamed" and recovered.archived
    assert recovered.messages[-1].status == "failed"
    assert recovered.messages[-1].text == "Partial"
    assert "restarted" in recovered.messages[-1].error
    domain.store.engine.dispose()


def test_local_guard_auth_and_disabled(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNKINEMA_API_TOKEN", "token")
    monkeypatch.setenv("SYNKINEMA_ALLOWED_HOSTS", "studio.lan")
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app, base_url="http://localhost", client=("127.0.0.1", 123)) as client:
        path = "/api/agent-chat/settings"
        assert client.get(path).status_code == 401
        client.headers["Authorization"] = "Bearer token"
        assert client.get(path).status_code == 200
        assert client.get(path, headers={"Host": "studio.lan"}).status_code == 403
        assert client.get(path, headers={"Origin": "https://evil.example"}).status_code == 403
        assert client.post("/api/agent-chat/mcp/expired/", json={}).status_code == 404
    app = create_app(tmp_path / "remote", start_worker=False)
    with TestClient(app, base_url="http://localhost", client=("192.168.1.50", 123)) as client:
        assert (
            client.get(
                "/api/agent-chat/settings",
                headers={"X-Forwarded-For": "127.0.0.1", "Authorization": "Bearer token"},
            ).status_code
            == 403
        )
    monkeypatch.setenv("SYNKINEMA_AGENT_CHAT_ENABLED", "false")
    app = create_app(tmp_path / "disabled", start_worker=False)
    with TestClient(
        app, base_url="http://localhost", client=("127.0.0.1", 123), headers={"Authorization": "Bearer token"}
    ) as client:
        assert not client.get("/api/agent-chat/settings").json()["enabled"]
        assert client.post("/api/agent-chat/chats", json={}).status_code == 422


@pytest.mark.asyncio
async def test_scope_preview_atomicity_and_required_revision(tmp_path):
    from synkinema.chat_mcp import make_chat_mcp

    domain = Service(Store(tmp_path))
    project, other = [domain.create(Project(name=name)) for name in ["P", "Q"]]
    applied = []
    active = True
    mcp = make_chat_mcp(domain, project.id, True, lambda: active, applied.append)
    with pytest.raises(ToolError, match="assigned project"):
        await mcp.call_tool("get_project", {"project_id": other.id})
    with pytest.raises(ToolError, match="expected_revision"):
        await mcp.call_tool(
            "apply_batch",
            {
                "project_id": project.id,
                "request": {"operations": [{"type": "update_project", "payload": {"name": "no revision"}}]},
            },
        )
    request = {
        "expected_revision": project.revision,
        "operations": [{"type": "update_project", "payload": {"name": "Preview"}}],
    }
    preview = await mcp.call_tool("preview_batch", {"project_id": project.id, "request": request})
    assert '"committed":false' in str(preview).replace(" ", "") or "'committed':False" in str(
        preview
    ).replace(" ", "")
    assert domain.get(project.id).name == "P"
    request["operations"].append({"type": "remove_track", "payload": {"track_id": "missing"}})
    with pytest.raises(ToolError, match="Step 2"):
        await mcp.call_tool("apply_batch", {"project_id": project.id, "request": request})
    assert domain.get(project.id).name == "P" and domain.get(project.id).revision == 1
    assert not applied
    active = False
    with pytest.raises(ToolError, match="revoked"):
        await mcp.call_tool("get_project", {"project_id": project.id})
    for scope, edit in [(None, True), (project.id, False)]:
        readonly = make_chat_mcp(domain, scope, edit, lambda: True, applied.append)
        assert "apply_batch" not in {t.name for t in await readonly.list_tools()}
    domain.store.engine.dispose()


@pytest.mark.asyncio
async def test_utf8_lines_and_claude_multiple_blocks():
    stream = asyncio.StreamReader()
    line = json.dumps({"text": "Zażółć 🌍"}, ensure_ascii=False).encode()
    for byte in line:
        stream.feed_data(bytes([byte]))
    stream.feed_eof()
    assert [event async for event in json_lines(stream)] == [{"text": "Zażółć 🌍"}]
    parser = OutputParser("claude")
    parser.parse({"type": "stream_event", "event": {"type": "message_start", "message": {"id": "same"}}})
    for index, text in enumerate(["First", "Second"]):
        parser.parse(
            {
                "type": "stream_event",
                "event": {
                    "type": "content_block_start",
                    "index": index,
                    "content_block": {"type": "text", "text": ""},
                },
            }
        )
        parser.parse(
            {
                "type": "stream_event",
                "event": {
                    "type": "content_block_delta",
                    "index": index,
                    "delta": {"type": "text_delta", "text": text},
                },
            }
        )
        output = parser.parse(
            {"type": "assistant", "message": {"id": "same", "content": [{"type": "text", "text": text}]}}
        )
    assert output["text"] == "First\n\nSecond"
    assert (
        parser.parse(
            {
                "type": "assistant",
                "parent_tool_use_id": "subagent",
                "message": {"content": [{"type": "text", "text": "ignore"}]},
            }
        )
        == {}
    )
