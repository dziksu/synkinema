"""Run the Studio SSR server and one private engine; stop both if either exits."""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path


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
        for command in (
            [sys.executable, "-m", "synkinema.cli", "serve", "--host", "127.0.0.1", "--port", "8081"],
            ["node", str(Path(__file__).resolve().parents[1] / "studio/server/index.mjs")],
        ):
            if stopping:
                break
            children.append(subprocess.Popen(command, start_new_session=True))
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
