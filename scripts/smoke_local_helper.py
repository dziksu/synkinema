"""Smoke a compiled host helper against a real Docker image and disposable data."""

import argparse
import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def settled(client, chat_id, partial=False):
    for _ in range(200):
        response = client.get(f"/api/agent-chat/chats/{chat_id}")
        response.raise_for_status()
        chat = response.json()
        if (partial and chat["messages"][-1]["text"]) or (not partial and not chat["running"]):
            return chat
        time.sleep(0.05)
    raise AssertionError("Agent did not settle")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("--helper", type=Path, required=True)
    args = parser.parse_args()
    helper = args.helper.resolve()
    identity = f"synkinema-helper-qa-{secrets.token_hex(5)}"
    port, backend_port = free_port(), free_port()
    while backend_port == port:
        backend_port = free_port()
    process = None
    with tempfile.TemporaryDirectory(prefix="synkinema-helper-smoke-") as directory:
        root = Path(directory)
        fake = root / "fake-agent"
        fake.write_text(f"#!{sys.executable}\n" + (ROOT / "tests/fixtures/local_agent.py").read_text())
        fake.chmod(0o700)
        log = root / "launcher.log"
        command = [
            str(helper),
            "--image",
            args.image,
            "--port",
            str(port),
            "--backend-port",
            str(backend_port),
            "--container",
            identity,
            "--volume",
            identity,
            "--data-dir",
            str(root / "profile"),
            "--no-open",
        ]

        def start():
            with log.open("ab") as output:
                process = subprocess.Popen(
                    command, cwd=root, env={**os.environ, "PYTHONPATH": ""}, stdout=output, stderr=output
                )
            for _ in range(300):
                if process.poll() is not None:
                    raise AssertionError(log.read_text())
                try:
                    if (
                        httpx.get(
                            f"http://127.0.0.1:{port}/api/agent-chat/settings", timeout=1, trust_env=False
                        ).status_code
                        == 200
                    ):
                        return process
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            process.terminate()
            process.wait(timeout=20)
            raise AssertionError("Standalone launcher did not start\n" + log.read_text())

        def stop(client):
            state = json.loads((root / "profile/local.json").read_text())
            response = client.post(
                "/__synkinema_local/stop", headers={"Authorization": f"Bearer {state['token']}"}
            )
            assert response.status_code == 202
            process.wait(timeout=20)
            assert process.returncode == 0, log.read_text()

        try:
            process = start()
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10, trust_env=False) as client:
                response = client.get("/projects?q=&sort=newest&view=grid")
                assert response.status_code == 200 and "text/html" in response.headers["content-type"], (
                    response.status_code,
                    response.headers.get("location"),
                    response.text[:1200],
                )
                assert (
                    httpx.get(f"http://127.0.0.1:{backend_port}/api/projects", trust_env=False).status_code
                    == 401
                )
                settings = client.get("/api/agent-chat/settings").json()
                for provider in settings["settings"]["providers"].values():
                    provider["executable"] = str(fake)
                response = client.put(
                    "/api/agent-chat/settings",
                    json={"expected_version": settings["version"], "settings": settings["settings"]},
                )
                assert response.status_code == 200, response.text
                assert client.get("/api/agent-chat/codex/models").status_code == 200
                response = client.post("/api/projects", json={"name": "QA host helper"})
                assert response.status_code == 201, response.text
                project = response.json()
                chat = client.post("/api/agent-chat/chats", json={"project_id": project["id"]}).json()
                path = f"/api/agent-chat/chats/{chat['id']}"
                assert (
                    client.patch(path, json={"expected_version": chat["version"], "mode": "edit"}).status_code
                    == 200
                )
                assert (
                    client.post(path + "/messages", json={"text": "EDIT", "request_id": "edit"}).status_code
                    == 202
                )
                final = settled(client, chat["id"])
                assert final["messages"][-1]["status"] == "complete", final
                assert final["messages"][-1]["applied_revisions"] == [2]
                assert client.get(f"/api/projects/{project['id']}").json()["name"] == "Agent edited"
                general = client.post("/api/agent-chat/chats", json={}).json()
                stop_path = f"/api/agent-chat/chats/{general['id']}"
                assert (
                    client.post(
                        stop_path + "/messages", json={"text": "STOP", "request_id": "stop"}
                    ).status_code
                    == 202
                )
                settled(client, general["id"], partial=True)
                assert client.post(stop_path + "/stop").status_code == 200
                assert settled(client, general["id"])["messages"][-1]["status"] == "cancelled"
                stop(client)
            process = start()
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10, trust_env=False) as client:
                assert client.get(path).json()["messages"][-1]["text"] == "Cześć 🌍"
                assert client.get(f"/api/projects/{project['id']}").json()["revision"] == 2
                assert client.get("/api/agent-chat/settings").json()["availability"]["codex"]
                stop(client)
            assert not (root / "profile/local.json").exists()
            print(
                "PASS: standalone runtime, Docker SSR/API, host CLI, scoped MCP edit/revision conflict, partial Stop, persistence and clean shutdown"
            )
        finally:
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            subprocess.run(
                ["docker", "container", "rm", "--force", identity],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["docker", "volume", "rm", identity],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )


if __name__ == "__main__":
    main()
