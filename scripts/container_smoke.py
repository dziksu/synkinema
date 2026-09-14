"""Run inside the image: storage, real render, inspection, MCP initialization, no browser."""

import asyncio
import json
import os
import tempfile
from importlib.metadata import version
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from synkinema import __version__
from synkinema.app import create_app
from synkinema.inspection import Inspection
from synkinema.media import probe
from synkinema.models import Clip, OutputProfile, Project, Track
from synkinema.renderer import Renderer
from synkinema.service import Service
from synkinema.storage import Store


async def main():
    assert os.getuid() != 0, "The published image must run as non-root"
    expected_version = os.environ.get("SYNKINEMA_EXPECT_VERSION", __version__)
    assert __version__ == version("synkinema") == expected_version
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        source = root / "image.png"
        Image.new("RGB", (240, 400), "#1b6745").save(source)
        s = Service(Store(root / "data"))
        a = s.import_file(source)
        p = s.create(
            Project(
                name="Container smoke",
                profile=OutputProfile(width=180, height=320, fps=24),
                tracks=[
                    Track(kind="video", name="Main", clips=[Clip(asset_id=a["id"], duration_ms=1500)]),
                    Track(
                        kind="text", name="Caption", clips=[Clip(text="Zażółć gęślą jaźń", duration_ms=1500)]
                    ),
                ],
            )
        )
        out = s.store.path("renders/smoke.mp4")
        await Renderer(s).render(p, out)
        meta = probe(out)
        assert meta["duration_ms"] == 1500 and abs(meta["audio_duration_ms"] - 1500) < 100
        frame = await Inspection(s).frame(p.id, 500)
        assert Path(frame["path"]).exists()
        with TestClient(create_app(root / "api", start_worker=False)) as client:
            assert client.get("/api/health").json()["ffmpeg"]
            headers = {"Accept": "application/json, text/event-stream"}
            r = client.post(
                "/mcp/",
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "smoke", "version": "1"},
                    },
                },
            )
            assert r.status_code == 200
            assert r.json()["result"]["serverInfo"]["version"] == expected_version
        print(json.dumps({"result": "passed", "render": meta, "ffmpeg_frame": True, "mcp_initialize": True}))


asyncio.run(main())
