"""Run the Studio SSR server and one private engine; stop both if either exits."""

import ipaddress
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def studio_environment(environ=None, route_path=Path("/proc/net/route")):
    """Trust Docker's gateway only for a declared loopback-published deployment."""
    env = dict(os.environ if environ is None else environ)
    # Never inherit an arbitrary trusted peer. Derive it from the container route.
    env.pop("SYNKINEMA_AGENT_CHAT_PROXY_PEER", None)
    try:
        if not ipaddress.ip_address(env.get("SYNKINEMA_PUBLISHED_BIND_HOST", "")).is_loopback:
            return env
        routes = []
        for line in route_path.read_text().splitlines()[1:]:
            fields = line.split()
            if len(fields) < 8 or fields[1] != "00000000" or int(fields[3], 16) & 3 != 3:
                continue
            gateway = ipaddress.IPv4Address(int(fields[2], 16).to_bytes(4, "little"))
            if not gateway.is_unspecified and not gateway.is_loopback:
                routes.append((int(fields[6]), str(gateway)))
        if routes:
            env["SYNKINEMA_AGENT_CHAT_PROXY_PEER"] = min(routes)[1]
    except (OSError, ValueError, OverflowError):
        # Missing/invalid deployment information leaves the default guard intact.
        pass
    return env


def main():
    children = []
    stopping = False

    def stop(_signum=None, _frame=None):
        nonlocal stopping
        stopping = True
        for child in children:
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        # Only Node is exposed. Keep engine storage and its worker in a single process.
        for command, env in (
            (
                [sys.executable, "-m", "synkinema.cli", "serve", "--host", "127.0.0.1", "--port", "8081"],
                None,
            ),
            (
                ["node", str(Path(__file__).resolve().parents[1] / "studio/server/index.mjs")],
                studio_environment(),
            ),
        ):
            if stopping:
                break
            children.append(subprocess.Popen(command, env=env, start_new_session=True))
        while not stopping:
            for child in children:
                result = child.poll()
                if result is not None:
                    print(f"Application process {child.pid} exited with {result}", file=sys.stderr)
                    return result or 1
            time.sleep(0.2)
        return 0
    finally:
        stop()
        deadline = time.monotonic() + 8
        for child in children:
            try:
                child.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                # Kill its process group too, including any outstanding FFmpeg child.
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()


if __name__ == "__main__":
    raise SystemExit(main())
