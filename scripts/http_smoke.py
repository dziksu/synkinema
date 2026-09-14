"""Read-only checks of an actual running container; no user project mutations."""

import argparse
import json
import time
import urllib.error
import urllib.request


def check(url, expected_version):
    def get(path):
        with urllib.request.urlopen(f"{url}{path}", timeout=5) as response:
            return response.read()

    deadline = time.monotonic() + 60
    while True:
        try:
            health = json.loads(get("/api/health"))
            break
        except (OSError, urllib.error.URLError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)
    assert health["status"] == "ok" and health["ffmpeg"] and health["ffprobe"], health
    assert health["version"] == expected_version, health
    assert b"Synkinema" in get("/")
    assert get("/brand/logo-32.png").startswith(b"\x89PNG")
    assert get("/favicon.ico").startswith(b"\0\0\x01\0")
    schema = json.loads(get("/api/openapi.json"))
    assert schema["info"]["version"] == expected_version
    assert "/api/projects" in schema["paths"]
    assert isinstance(json.loads(get("/api/projects")), list)
    assert b"swagger-ui" in get("/api/docs")
    print(json.dumps({"http_smoke": "passed", "version": expected_version, "studio": True, "api": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:18080")
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    check(args.url.rstrip("/"), args.version)
