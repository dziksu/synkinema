"""Read-only checks of an actual running container; no user project mutations."""

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def check(url, expected_version, trusted_host=None):
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
    for path, heading in (
        ("/projects", b"Every story starts here."),
        ("/library", b"Your media"),
        ("/settings", b"Settings"),
    ):
        html = get(path)
        assert b"<html" in html and heading in html, path
        assets = re.findall(rb'(?:src|href)="(/assets/[^\"]+)"', html)
        assert assets, f"No built assets referenced by {path}"
        for asset in set(assets):
            assert get(asset.decode()), asset
    assert b"Private media" in get("/library?libraryView=private")
    assert get("/brand/logo-32.png").startswith(b"\x89PNG")
    assert get("/favicon.ico").startswith(b"\0\0\x01\0")
    schema = json.loads(get("/api/openapi.json"))
    assert schema["info"]["version"] == expected_version
    assert "/api/projects" in schema["paths"]
    assert isinstance(json.loads(get("/api/projects")), list)
    assert b"swagger-ui" in get("/api/docs")
    assert b"redoc" in get("/redoc")
    assert b"oauth2" in get("/docs/oauth2-redirect")
    request = urllib.request.Request(
        f"{url}/mcp/",
        data=json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "http-smoke", "version": "1"},
                },
            }
        ).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        assert json.load(response)["result"]["serverInfo"]["version"] == expected_version
    # Invalid JSON guarantees no data is written, even if an origin check regresses.
    probes = [
        ({"Origin": url}, 422),
        ({"Origin": "https://untrusted.invalid"}, 403),
        ({"Host": "untrusted.invalid"}, 400),
    ]
    if trusted_host:
        host = f"{trusted_host}:{urlsplit(url).port or 80}"
        probes.append(({"Host": host, "Origin": f"http://{host}"}, 422))
    for headers, status in probes:
        request = urllib.request.Request(
            f"{url}/api/projects",
            data=b"[",
            headers={"Content-Type": "application/json", **headers},
        )
        try:
            urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            assert error.code == status, (headers, error.code, error.read())
        else:
            raise AssertionError("Invalid request must be rejected")
    print(json.dumps({"http_smoke": "passed", "version": expected_version, "studio": True, "api": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:18080")
    parser.add_argument("--version", required=True)
    parser.add_argument("--trusted-host", help="Additional hostname configured in the test container")
    args = parser.parse_args()
    check(args.url.rstrip("/"), args.version, args.trusted_host)
