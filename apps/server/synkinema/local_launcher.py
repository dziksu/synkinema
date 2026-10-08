"""Standalone Docker + host CLI launcher. No repository or Python installation needed."""

import argparse
import asyncio
import contextlib
import json
import os
import re
import secrets
import shlex
import shutil
import signal
import socket
import sys
from pathlib import Path

import httpx
import uvicorn
from pydantic import Field

from . import __version__
from .chat_contract import AgentChat, AgentSettings, Model
from .chat_store import ChatStore
from .local_app import create_local_app
from .process_environment import external_environment

OWNER = "org.synkinema.local-helper"
INSTANCE = "org.synkinema.local-instance"


class LocalState(Model):
    token: str = Field(pattern=r"^[a-f0-9]{64}$")
    container: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")
    container_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    instance: str = Field(pattern=r"^[a-f0-9]{32}$")
    image: str
    port: int = Field(ge=1, le=65535)
    backend_port: int = Field(ge=1, le=65535)


def options(args=None):
    parser = argparse.ArgumentParser(
        prog="synkinema-local",
        description="Run Docker with host-installed, signed-in Codex/Claude/Copilot. Ctrl+C stops the profile and retains all data.",
    )
    parser.add_argument("command", nargs="?", choices=["start", "stop", "status"], default="start")
    parser.add_argument("--version", action="version", version=f"Synkinema local {__version__}")
    parser.add_argument("--port", type=int, default=43817, help="UI and host chat port (43817)")
    parser.add_argument("--backend-port", type=int, help="Private Docker port (UI port + 1)")
    parser.add_argument("--image", default=f"ghcr.io/dziksu/synkinema:v{__version__}")
    parser.add_argument("--container", default="synkinema-local")
    parser.add_argument(
        "--volume", default="synkinema_synkinema-data", help="Existing or new named Docker data volume"
    )
    parser.add_argument("--data-dir", type=Path, default=Path.home() / ".local/share/synkinema")
    parser.add_argument("--read-only", action="store_true", help="Disable agent project edits")
    parser.add_argument("--no-open", action="store_true", help="Do not open the browser")
    result = parser.parse_args(args)
    if result.backend_port is None:
        result.backend_port = result.port + 1
    if (
        not all(1 <= port <= 65535 for port in [result.port, result.backend_port])
        or result.port == result.backend_port
    ):
        parser.error("Use two different ports between 1 and 65535")
    for name in (result.container, result.volume):
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", name):
            parser.error("Container/volume names must be Docker names, not paths or options")
    if not result.image or result.image.startswith("-") or re.search(r"\s", result.image):
        parser.error("Invalid Docker image reference")
    result.data_dir = result.data_dir.expanduser().resolve()
    return result


async def docker(args, *, token=None):
    if not shutil.which("docker"):
        raise ValueError("Install and start Docker (Docker Desktop/Colima) first")
    env = external_environment()
    if token:
        env["SYNKINEMA_API_TOKEN"] = token
    process = await asyncio.create_subprocess_exec(
        "docker",
        *args,
        env=env,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        output, error = await asyncio.wait_for(process.communicate(), timeout=180)
    except BaseException:
        process.kill()
        await process.wait()
        raise
    if process.returncode:
        message = error.decode("utf-8", "replace").strip()[-2000:]
        if token:
            message = message.replace(token, "[private token]")
        image = next((arg for arg in args if arg.startswith("ghcr.io/")), None)
        if image and any(
            reason in message.lower() for reason in ("unauthorized", "denied", "manifest unknown")
        ):
            message += (
                f"\nCannot download {image}. The published image must allow anonymous pulls."
                "\nFrom a Synkinema checkout, run `docker build -t synkinema:local .`,"
                " then restart this launcher with `--image synkinema:local`."
                " Keep the same --volume to retain projects and media."
            )
        raise ValueError(f"Docker: {message or 'command failed'}")
    return output.decode("utf-8", "replace").strip()


async def inspect(name):
    try:
        return json.loads(await docker(["container", "inspect", "--format", "{{json .}}", name]))
    except ValueError as exc:
        if "No such" in str(exc):
            return None
        raise


async def remove_owned(name, container_id, instance):
    existing = await inspect(name)
    if not existing:
        return
    labels = existing["Config"].get("Labels") or {}
    if existing["Id"] != container_id or labels.get(OWNER) != "true" or labels.get(INSTANCE) != instance:
        raise ValueError(f"Refusing to remove unrelated container {name}")
    await docker(["container", "rm", "--force", container_id])  # Never remove the named volume.


def read_state(path):
    return LocalState.model_validate_json(path.read_text()) if path.exists() else None


def write_state(path, state):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(state.model_dump_json())
    temporary.chmod(0o600)
    temporary.replace(path)


@contextlib.contextmanager
def profile_lock(directory):
    import fcntl

    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.stat().st_mode & 0o077:
        raise ValueError(f"Use a private profile directory (0700): {directory}")
    with (directory / "local.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError("This local profile is already running; use status/stop first") from exc
        yield


def reserve_port(port):
    sock = socket.socket()
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("127.0.0.1", port))
        return sock
    except OSError as exc:
        sock.close()
        raise ValueError(
            f"Local port {port} is occupied. Stop its application or choose another port"
        ) from exc


async def wait_backend(origin, token, stopped):
    async with httpx.AsyncClient(base_url=origin, timeout=2, trust_env=False) as client:
        for _ in range(120):
            if stopped.is_set():
                raise ValueError("Local startup was stopped")
            try:
                response = await client.get("/api/health")
                if response.is_success:
                    version = response.json()["version"]
                    if version != __version__:
                        raise ValueError(
                            f"Helper {__version__} requires a matching Docker image; got {version}"
                        )
                    protected = await client.get(
                        "/api/projects", headers={"Authorization": f"Bearer {token}"}
                    )
                    if not protected.is_success:
                        raise ValueError("Docker authentication does not match the local profile")
                    anonymous = await client.get("/api/projects")
                    if anonymous.status_code != 401:
                        raise ValueError("Docker backend must require the private profile token")
                    return
            except (httpx.HTTPError, KeyError):
                pass
            try:
                await asyncio.wait_for(stopped.wait(), timeout=0.5)
            except TimeoutError:
                pass
    raise ValueError("Docker did not become healthy. Check its logs and try again")


EXPORT_CHATS = """
import json, sqlite3
db = sqlite3.connect('file:/data/synkinema.db?mode=ro', uri=True)
tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
print(json.dumps({
 'chats': list(db.execute('SELECT id,document,position FROM agent_chats ORDER BY position')) if 'agent_chats' in tables else [],
 'settings': list(db.execute('SELECT id,version,document FROM agent_settings')) if 'agent_settings' in tables else []
}))
db.close()
"""


async def import_chats(config):
    directory = config.data_dir / "chat"
    if (directory / "chat.db").exists():
        return
    # Read only; original history stays in Docker for rollback to the old deployment.
    snapshot = json.loads(
        await docker(
            [
                "run",
                "--rm",
                "--network",
                "none",
                "--read-only",
                "--entrypoint",
                "python",
                "--volume",
                f"{config.volume}:/data:ro",
                config.image,
                "-c",
                EXPORT_CHATS,
            ]
        )
    )
    for _, document, _ in snapshot["chats"]:
        AgentChat.model_validate_json(document)
    for _, _, document in snapshot["settings"]:
        AgentSettings.model_validate_json(document)
    store = ChatStore(directory)
    try:
        store.execute(
            "CREATE TABLE agent_chats(id TEXT PRIMARY KEY, document TEXT NOT NULL, position INTEGER NOT NULL)"
        )
        store.execute(
            "CREATE TABLE agent_settings(id INTEGER PRIMARY KEY, version INTEGER NOT NULL, document TEXT NOT NULL)"
        )
        from sqlalchemy import text

        with store.transaction() as conn:
            for chat_id, document, position in snapshot["chats"]:
                conn.execute(
                    text("INSERT INTO agent_chats VALUES(:id,:document,:position)"),
                    {"id": chat_id, "document": document, "position": position},
                )
            for settings_id, version, document in snapshot["settings"]:
                conn.execute(
                    text("INSERT INTO agent_settings VALUES(:id,:version,:document)"),
                    {"id": settings_id, "version": version, "document": document},
                )
    except BaseException:
        store.engine.dispose()
        for name in ("chat.db", "chat.db-wal", "chat.db-shm"):
            (directory / name).unlink(missing_ok=True)
        raise
    finally:
        store.engine.dispose()
    if snapshot["chats"]:
        print(
            f"Imported {len(snapshot['chats'])} existing conversations. Docker originals are retained.",
            flush=True,
        )


async def control(state, command):
    if not state:
        return False
    try:
        async with httpx.AsyncClient(timeout=3, trust_env=False) as client:
            response = await client.request(
                "POST" if command == "stop" else "GET",
                f"http://127.0.0.1:{state.port}/__synkinema_local/{command}",
                headers={"Authorization": f"Bearer {state.token}"},
            )
            return response.is_success
    except httpx.HTTPError:
        return False


class LocalServer(uvicorn.Server):
    @contextlib.contextmanager
    def capture_signals(self):
        yield  # The launcher owns signals during startup and shutdown too.


async def run(config):
    state_path = config.data_dir / "local.json"
    if config.command != "start":
        state = read_state(state_path)
        if await control(state, config.command):
            print(
                "Stopping Synkinema."
                if config.command == "stop"
                else f"Synkinema is running at http://localhost:{state.port}."
            )
        else:
            if state and config.command == "stop":
                with profile_lock(config.data_dir):
                    await remove_owned(state.container, state.container_id, state.instance)
                    state_path.unlink(missing_ok=True)
            print("Synkinema local is not running.")
        return

    with profile_lock(config.data_dir):
        stopped, loop = asyncio.Event(), asyncio.get_running_loop()
        container_id, server, listener = None, None, None
        instance = secrets.token_hex(16)
        run_attempted = False

        def stop():
            stopped.set()
            if server:
                server.should_exit = True

        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, stop)
        try:
            previous = read_state(state_path)
            if await inspect(config.container):
                if not previous or previous.container != config.container:
                    raise ValueError(f"Container {config.container} belongs to another deployment")
                await remove_owned(config.container, previous.container_id, previous.instance)
            users = await docker(["ps", "--filter", f"volume={config.volume}", "--format", "{{.Names}}"])
            if users:
                names = users.splitlines()
                stop_command = shlex.join(["docker", "stop", *names])
                raise ValueError(
                    f"Data volume {config.volume} is already used by {', '.join(names)}."
                    "\nFinish any active renders or agent turns, then stop that deployment first:"
                    f"\n  {stop_command}"
                    "\nStopping retains projects and media. Restart this launcher afterwards."
                    " Changing only --port will not resolve a shared-volume conflict."
                )
            listener = reserve_port(config.port)
            reserve_port(config.backend_port).close()
            token = secrets.token_hex(32)
            print(f"Starting {config.image}. Agent CLIs run on this computer.", flush=True)
            if stopped.is_set():
                return
            run_attempted = True
            args = [
                "run",
                "--detach",
                "--name",
                config.container,
                "--label",
                f"{OWNER}=true",
                "--label",
                f"{INSTANCE}={instance}",
                "--publish",
                f"127.0.0.1:{config.backend_port}:8080",
                "--volume",
                f"{config.volume}:/data",
                "--env",
                "SYNKINEMA_API_TOKEN",
                "--env",
                "SYNKINEMA_AGENT_CHAT_ENABLED=false",
                "--env",
                "SYNKINEMA_PUBLISHED_BIND_HOST=127.0.0.1",
                "--env",
                f"SYNKINEMA_AGENT_CHAT_READ_ONLY={'true' if config.read_only else 'false'}",
            ]
            # Preserve explicitly configured provider credentials in the engine;
            # agent CLI authentication itself is never mounted or sent to Docker.
            for key in ("ELEVENLABS_API_KEY", "SYNKINEMA_FFMPEG_THREADS"):
                if key in os.environ:
                    args.extend(["--env", key])
            container_id = await docker([*args, config.image], token=token)
            state = LocalState(
                token=token,
                container=config.container,
                container_id=container_id,
                instance=instance,
                image=config.image,
                port=config.port,
                backend_port=config.backend_port,
            )
            write_state(state_path, state)
            origin = f"http://127.0.0.1:{config.backend_port}"
            await wait_backend(origin, token, stopped)
            await import_chats(config)
            if stopped.is_set():
                return
            app = create_local_app(
                origin, token, config.data_dir / "chat", read_only=config.read_only, on_stop=stop
            )
            server = LocalServer(
                uvicorn.Config(
                    app,
                    host="127.0.0.1",
                    port=config.port,
                    loop="asyncio",
                    http="h11",
                    log_level="warning",
                    access_log=False,
                    timeout_graceful_shutdown=10,
                )
            )
            task = asyncio.create_task(server.serve(sockets=[listener]))
            while not server.started and not task.done():
                await asyncio.sleep(0.02)
            if task.done():
                await task
                raise ValueError("The local gateway did not start")
            print(
                f"\nSynkinema {__version__}: http://localhost:{config.port}\nChat: {config.data_dir / 'chat'}\nCtrl+C stops this profile and retains the data volume.\n",
                flush=True,
            )
            if not config.no_open and not stopped.is_set():
                opener = "open" if sys.platform == "darwin" else "xdg-open"
                if shutil.which(opener):
                    await asyncio.create_subprocess_exec(
                        opener,
                        f"http://localhost:{config.port}",
                        env=external_environment(),
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
            if stopped.is_set():
                server.should_exit = True
            await task
        finally:
            if listener:
                listener.close()
            try:
                if not container_id and run_attempted:
                    leftover = await inspect(config.container)
                    if leftover and (leftover["Config"].get("Labels") or {}).get(INSTANCE) == instance:
                        container_id = leftover["Id"]
                if container_id:
                    await remove_owned(config.container, container_id, instance)
                if (
                    container_id
                    and state_path.exists()
                    and read_state(state_path).container_id == container_id
                ):
                    state_path.unlink()
            finally:
                for sig in (signal.SIGINT, signal.SIGTERM):
                    loop.remove_signal_handler(sig)


def main():
    if sys.platform not in ("darwin", "linux"):
        raise SystemExit("The local launcher supports macOS and Linux")
    os.umask(0o077)
    try:
        asyncio.run(run(options()))
    except (ValueError, OSError, TimeoutError) as exc:
        raise SystemExit(str(exc)) from None


if __name__ == "__main__":
    main()
