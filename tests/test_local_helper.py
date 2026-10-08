"""Host gateway integration, isolation, startup races and installer integrity."""

import asyncio
import contextlib
import hashlib
import json
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import pytest
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import Response, StreamingResponse
from fastapi.testclient import TestClient
from synkinema.app import create_app
from synkinema.chat_backend import local_origin
from synkinema.chat_contract import AgentChatCreate, AgentSend, AgentSettingsUpdate
from synkinema.chat_service import ChatService
from synkinema.chat_store import ChatStore
from synkinema.errors import Conflict
from synkinema.local_app import create_local_app
from synkinema.local_launcher import (
    LocalState,
    import_chats,
    options,
    profile_lock,
    remove_owned,
    reserve_port,
    run,
)
from synkinema.models import Project
from test_local_agent_chat import FAKE_CLI, wait_chat

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def fake_cli(tmp_path):
    path = tmp_path / "fake-agent"
    path.write_text(f"#!{sys.executable}\n" + FAKE_CLI)
    path.chmod(0o700)
    return path


@contextlib.contextmanager
def live_app(app):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    assert server.started
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=5, trust_env=False) as client:
            yield client
    finally:
        server.should_exit = True
        thread.join(timeout=12)
        sock.close()
        assert not thread.is_alive()


def test_gateway_native_cli_edits_docker_domain_and_preserves_streaming(tmp_path, fake_cli, monkeypatch):
    token = "a" * 64
    monkeypatch.setenv("SYNKINEMA_API_TOKEN", token)
    monkeypatch.setenv("SYNKINEMA_AGENT_CHAT_ENABLED", "false")
    engine = create_app(tmp_path / "engine", start_worker=False)
    project = engine.state.service.create(Project(name="Docker project"))

    @engine.post("/proxy-upload")
    async def upload(request: Request):
        return Response(await request.body(), headers={"Content-Type": "application/octet-stream"})

    @engine.get("/media/test-range")
    async def media(request: Request):
        assert request.headers["range"] == "bytes=2-5"
        return Response(
            b"2345", status_code=206, headers={"Content-Range": "bytes 2-5/10", "Accept-Ranges": "bytes"}
        )

    with live_app(engine) as backend:
        gateway = create_local_app(str(backend.base_url), token, tmp_path / "chat")
        with live_app(gateway) as client:
            assert backend.get("/api/projects").status_code == 401
            assert client.get("/api/projects").json()[0]["id"] == project.id
            assert client.post("/proxy-upload", content=b"uploaded\x00bytes").content == b"uploaded\x00bytes"
            response = client.get("/media/test-range", headers={"Range": "bytes=2-5"})
            assert response.status_code == 206 and response.content == b"2345"
            assert response.headers["content-range"] == "bytes 2-5/10"
            settings = client.get("/api/agent-chat/settings").json()
            assert settings["enabled"]
            for config in settings["settings"]["providers"].values():
                config["executable"] = str(fake_cli)
            assert (
                client.put(
                    "/api/agent-chat/settings",
                    json={"settings": settings["settings"], "expected_version": settings["version"]},
                ).status_code
                == 200
            )
            assert client.get("/api/agent-chat/codex/models").status_code == 200
            chat = client.post("/api/agent-chat/chats", json={"project_id": project.id}).json()
            path = f"/api/agent-chat/chats/{chat['id']}"
            edited = client.patch(path, json={"expected_version": chat["version"], "mode": "edit"}).json()
            assert edited["mode"] == "edit"
            assert (
                client.post(path + "/messages", json={"text": "EDIT", "request_id": "edit"}).status_code
                == 202
            )
            final = wait_chat(client, chat["id"])
            assert final["messages"][-1]["status"] == "complete", final
            assert final["messages"][-1]["applied_revisions"] == [2]
            assert engine.state.service.get(project.id).name == "Agent edited"
            capability = Path(str(fake_cli) + ".capability").read_text()
            assert client.post(capability, json={}).status_code == 404
            readonly = client.patch(path, json={"expected_version": final["version"], "mode": "ask"}).json()
            assert readonly["mode"] == "ask"
            assert (
                client.post(path + "/messages", json={"text": "STOP", "request_id": "stop"}).status_code
                == 202
            )
            wait_chat(client, chat["id"], lambda chat: bool(chat["messages"][-1]["text"]))
            assert client.post(path + "/stop").status_code == 200
            final = wait_chat(client, chat["id"])
            assert final["messages"][-1]["text"] == "Cześć 🌍"
            assert final["messages"][-1]["status"] == "cancelled"
        assert not gateway.state.chat.runs
    assert (tmp_path / "chat/chat.db").exists()


def test_gateway_loopback_origins_controls_and_read_only(tmp_path):
    gateway = create_local_app("http://127.0.0.1:1", "a" * 64, tmp_path / "chat", read_only=True)
    with TestClient(gateway, base_url="http://localhost:43817", client=("127.0.0.1", 123)) as client:
        assert client.get("/api/agent-chat/settings").json()["read_only"]
        for headers in (
            {"Origin": "https://evil.example"},
            {"Origin": "http://localhost:9999"},
            {"Host": "evil.example"},
            {"Sec-Fetch-Site": "cross-site"},
            {"Origin": "http://[invalid"},
        ):
            assert client.get("/api/agent-chat/settings", headers=headers).status_code == 403
        assert client.get("/__synkinema_local/status").status_code == 401
        assert client.get(
            "/__synkinema_local/status", headers={"Authorization": "Bearer " + "a" * 64}
        ).json()["running"]
    gateway = create_local_app("http://127.0.0.1:1", "a" * 64, tmp_path / "remote")
    with TestClient(gateway, base_url="http://localhost:43817", client=("192.168.1.30", 123)) as client:
        assert (
            client.get("/api/agent-chat/settings", headers={"X-Forwarded-For": "127.0.0.1"}).status_code
            == 403
        )


def test_proxy_disconnect_releases_the_upstream_stream(tmp_path):
    engine, ended = FastAPI(), threading.Event()

    @engine.get("/stream")
    async def stream():
        async def chunks():
            try:
                while True:
                    yield b"stream chunk\n" * 4096
                    await asyncio.sleep(0.03)
            finally:
                ended.set()

        return StreamingResponse(chunks(), media_type="application/octet-stream")

    with live_app(engine) as backend:
        gateway = create_local_app(str(backend.base_url), "a" * 64, tmp_path / "chat")
        with live_app(gateway) as client:
            with client.stream("GET", "/stream") as response:
                assert next(response.iter_raw()).startswith(b"stream chunk")
            assert ended.wait(timeout=2), "Aborted browser stream kept its Docker connection alive"


@pytest.mark.asyncio
async def test_pending_remote_reads_reserve_slots_and_cannot_spawn_after_stop(tmp_path, fake_cli):
    class SlowBackend:
        blocked = False

        async def project(self, project_id):
            if self.blocked:
                started.set()
                await release.wait()
            return {"id": project_id, "name": "P"}

    started, release = asyncio.Event(), asyncio.Event()
    backend = SlowBackend()
    store = ChatStore(tmp_path / "chat")
    chats = ChatService(backend, store)
    settings = chats.settings()
    settings.settings.providers.codex.executable = str(fake_cli)
    chats.update_settings(AgentSettingsUpdate(expected_version=settings.version, settings=settings.settings))
    topics = [await chats.create(AgentChatCreate(project_id="p")) for _ in range(4)]
    backend.blocked = True
    tasks = [
        asyncio.create_task(
            chats.send(topic.id, AgentSend(text="Hello", request_id=topic.id), "http://127.0.0.1:1")
        )
        for topic in topics[:3]
    ]
    await started.wait()
    assert len(chats.runs) == 3
    with pytest.raises(Conflict, match="Three agents"):
        await chats.send(topics[3].id, AgentSend(text="Fourth", request_id="fourth"), "http://127.0.0.1:1")
    for topic in topics[:3]:
        await chats.stop(topic.id)
    closing = asyncio.create_task(chats.close())
    await asyncio.sleep(0)
    release.set()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    await closing
    assert all(isinstance(result, Conflict) for result in results)
    assert not chats.runs and not Path(str(fake_cli) + ".capability").exists()
    assert all(not chats.get(topic.id).messages for topic in topics)
    store.engine.dispose()


@pytest.mark.asyncio
async def test_launcher_ownership_shared_volume_and_failed_run_cleanup(tmp_path, monkeypatch):
    from synkinema import local_launcher

    calls, existing, users = [], None, "other-container"

    async def fake_docker(args, **kwargs):
        calls.append(args)
        if args[:2] == ["container", "inspect"]:
            if existing is None:
                raise ValueError("Docker: No such container")
            return json.dumps(existing)
        if args[0] == "ps":
            return users
        if args[0] == "run":
            labels = {
                args[index + 1].split("=", 1)[0]: args[index + 1].split("=", 1)[1]
                for index, value in enumerate(args)
                if value == "--label"
            }
            existing.update({"Id": "b" * 64, "Config": {"Labels": labels}})
            raise ValueError("Docker: port is already allocated")
        if args[:2] == ["container", "rm"]:
            return "removed"
        raise AssertionError(args)

    monkeypatch.setattr(local_launcher, "docker", fake_docker)
    config = options(["--data-dir", str(tmp_path / "profile"), "--port", "59150", "--no-open"])
    with pytest.raises(ValueError, match="already used") as error:
        await run(config)
    assert "docker stop other-container" in str(error.value)
    assert "Stopping retains projects and media" in str(error.value)
    assert "Changing only --port" in str(error.value)
    assert not any(call[0] == "run" for call in calls)
    users = "first-container\nsecond-container"
    with pytest.raises(ValueError, match="already used") as error:
        await run(config)
    assert "docker stop first-container second-container" in str(error.value)
    assert not any(call[0] in ("run", "stop", "rm") for call in calls)
    users, existing = "", {"Id": "a" * 64, "Config": {"Labels": {}}}
    with pytest.raises(ValueError, match="another deployment"):
        await run(config)
    with pytest.raises(ValueError, match="unrelated"):
        await remove_owned(config.container, "a" * 64, "c" * 32)
    existing = {}
    original_inspect = local_launcher.inspect

    async def first_inspect(name):
        return await original_inspect(name) if existing else None

    monkeypatch.setattr(local_launcher, "inspect", first_inspect)
    awaitable = run(config)
    with pytest.raises(ValueError, match="port is already allocated"):
        await awaitable
    assert ["container", "rm", "--force", "b" * 64] in calls
    assert not any("--volumes" in call for call in calls)


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["unauthorized", "denied", "manifest unknown"])
async def test_unavailable_release_image_explains_local_recovery_without_leaking_token(monkeypatch, reason):
    from synkinema import local_launcher

    token = "private-profile-token"

    class FailedPull:
        returncode = 1

        async def communicate(self):
            return b"", f"Error: {reason} ({token})".encode()

    async def spawn(*args, **kwargs):
        return FailedPull()

    monkeypatch.setattr(local_launcher.shutil, "which", lambda name: "/bin/docker")
    monkeypatch.setattr(local_launcher.asyncio, "create_subprocess_exec", spawn)
    with pytest.raises(ValueError) as error:
        await local_launcher.docker(["run", "ghcr.io/dziksu/synkinema:v1.7.1"], token=token)
    message = str(error.value)
    assert token not in message
    assert "anonymous pulls" in message
    assert "docker build -t synkinema:local ." in message
    assert "--image synkinema:local" in message
    assert "same --volume" in message
    with pytest.raises(ValueError) as error:
        await local_launcher.docker(["container", "inspect", "unknown"], token=token)
    assert "docker build" not in str(error.value)


@pytest.mark.asyncio
async def test_import_history_preserves_ids_order_settings_and_originals(tmp_path, monkeypatch):
    from synkinema import local_launcher

    config = options(["--data-dir", str(tmp_path / "profile")])
    store = ChatStore(tmp_path / "source")

    class Backend:
        pass

    chats = ChatService(Backend(), store)
    topic = await chats.create(AgentChatCreate())
    settings = chats.settings()
    snapshot = {
        "chats": [[topic.id, topic.model_dump_json(), 7]],
        "settings": [[1, settings.version, settings.settings.model_dump_json()]],
    }
    calls = []

    async def fake_docker(args, **kwargs):
        calls.append(args)
        return json.dumps(snapshot)

    monkeypatch.setattr(local_launcher, "docker", fake_docker)
    await import_chats(config)
    host_store = ChatStore(config.data_dir / "chat")
    assert host_store.rows("SELECT id,position FROM agent_chats") == [{"id": topic.id, "position": 7}]
    assert host_store.rows("SELECT version FROM agent_settings") == [{"version": 1}]
    assert chats.get(topic.id).id == topic.id
    assert f"{config.volume}:/data:ro" in calls[0] and "--network" in calls[0]
    await import_chats(config)
    assert len(calls) == 1
    host_store.engine.dispose()
    store.engine.dispose()


def test_options_origins_lock_and_state_validation(tmp_path):
    assert options(["--port", "50000"]).backend_port == 50001
    for args in (
        ["--port", "65535"],
        ["--port", "1", "--backend-port", "1"],
        ["--volume", "/data"],
        ["--image=-evil"],
    ):
        with pytest.raises(SystemExit):
            options(args)
    for origin in (
        "https://localhost:8080",
        "http://remote:8080",
        "http://localhost:8080/path",
        "http://user:pass@localhost:8080",
        "http://localhost:8080?x=1",
    ):
        with pytest.raises(ValueError):
            local_origin(origin)
    with (
        profile_lock(tmp_path / "profile"),
        pytest.raises(ValueError, match="already running"),
        profile_lock(tmp_path / "profile"),
    ):
        pass
    with pytest.raises(ValueError):
        LocalState(
            token="short",
            container="valid",
            container_id="a" * 64,
            instance="b" * 32,
            image="image",
            port=1,
            backend_port=2,
        )


def test_listener_can_restart_immediately_but_refuses_a_live_server():
    listener = reserve_port(0)
    port = listener.getsockname()[1]
    listener.listen(1)
    with pytest.raises(ValueError, match="occupied"):
        reserve_port(port)
    client = socket.create_connection(("127.0.0.1", port))
    connection, _ = listener.accept()
    connection.close()
    client.close()
    listener.close()
    reserve_port(port).close()


def test_installer_checksum_and_no_clone_startup(tmp_path):
    fixtures, bins, install = tmp_path / "fixtures", tmp_path / "bin", tmp_path / "installed"
    fixtures.mkdir()
    bins.mkdir()
    artifact = (
        "synkinema-local-"
        + ("darwin" if sys.platform == "darwin" else "linux")
        + ("-arm64" if os.uname().machine in ("arm64", "aarch64") else "-x64")
    )
    binary = fixtures / artifact
    binary.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$INSTALL_TEST_ARGS"\n')
    (fixtures / "SHA256SUMS").write_text(
        hashlib.sha256(binary.read_bytes()).hexdigest() + "  " + artifact + "\n"
    )
    (bins / "docker").write_text("#!/bin/sh\nexit 0\n")
    (bins / "curl").write_text(
        f"#!{sys.executable}\nimport os, shutil, sys\nfrom pathlib import Path\nurl=next(arg for arg in sys.argv if arg.startswith('https:'))\nshutil.copyfile(Path(os.environ['INSTALL_TEST_FIXTURES'])/url.rsplit('/',1)[1],sys.argv[sys.argv.index('-o')+1])\n"
    )
    for file in bins.iterdir():
        file.chmod(0o700)
    script = tmp_path / "installer.sh"
    script.write_text(
        (ROOT / "scripts/local-install.sh")
        .read_text()
        .replace("__SYNKINEMA_REPOSITORY__", "dziksu/synkinema")
    )
    capture = tmp_path / "args"
    env = {
        **os.environ,
        "PATH": str(bins) + ":" + os.environ["PATH"],
        "SYNKINEMA_VERSION": "1.2.3",
        "SYNKINEMA_LOCAL_DIR": str(install),
        "INSTALL_TEST_FIXTURES": str(fixtures),
        "INSTALL_TEST_ARGS": str(capture),
    }
    result = subprocess.run(
        ["sh", str(script), "--port", "50000", "--no-open"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert capture.read_text().splitlines() == ["--data-dir", str(install), "--port", "50000", "--no-open"]
    assert (install / "synkinema-local").is_symlink()
    capture.unlink()
    binary.write_text("corrupted binary")
    result = subprocess.run(["sh", str(script)], env=env, capture_output=True, text=True, check=False)
    assert result.returncode != 0 and "checksum" in result.stderr
    assert not capture.exists()
