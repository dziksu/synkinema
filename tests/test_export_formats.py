"""Real delivery geometry, range quality, snapshot and API/MCP export contracts."""

import asyncio
import io
import json
import subprocess

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from synkinema.app import create_app
from synkinema.exporting import export_catalog, export_plan
from synkinema.media import probe
from synkinema.models import Clip, ExportOutput, OutputProfile, Project, RenderRequest, Track
from synkinema.renderer import Renderer
from synkinema.service import Service
from synkinema.storage import Store


@pytest.fixture
def scene(tmp_path):
    service = Service(Store(tmp_path / "data"))
    path = tmp_path / "source.png"
    im = Image.new("RGB", (384, 128), "#00ff00")
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 127, 127), fill="#ff0000")
    d.rectangle((256, 0, 383, 127), fill="#0000ff")
    im.save(path)
    asset = service.import_file(path, "Wide source")
    p = service.create(
        Project(
            name="Export QA",
            profile=OutputProfile(width=384, height=128, fps=12, normalize=False),
            tracks=[
                Track(
                    name="Video",
                    kind="video",
                    clips=[Clip(name="Shot", asset_id=asset["id"], duration_ms=1000)],
                )
            ],
        )
    )
    return service, p


def frame(path):
    return np.array(
        Image.open(
            io.BytesIO(
                subprocess.check_output(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-i",
                        str(path),
                        "-frames:v",
                        "1",
                        "-f",
                        "image2pipe",
                        "-vcodec",
                        "png",
                        "-",
                    ]
                )
            )
        )
    )


@pytest.mark.parametrize(
    "width,height",
    [(1280, 720), (720, 1280), (2560, 1440), (3840, 2160), (2160, 3840), (1080, 1080), (1080, 1350)],
)
def test_actual_delivery_dimensions_and_pixels(scene, tmp_path, width, height):
    service, p = scene
    # Three frames exercise UHD encoder/decoder without retaining large QA media.
    p.tracks[0].clips[0].duration_ms = 250
    out = tmp_path / "delivery.mp4"
    asyncio.run(
        Renderer(service).render(p, out, output_settings=ExportOutput(width=width, height=height, fps=12))
    )
    metadata = probe(out)
    assert (metadata["width"], metadata["height"]) == (width, height)
    assert abs(metadata["duration_ms"] - 250) < 30
    pixels = frame(out)
    assert pixels[height // 2, width // 2, 1] > 200  # Actual green source is present.
    assert pixels[0, 0].max() < 40  # Fit preserves source with letterbox bars.


@pytest.mark.parametrize("fit,x,color", [("contain", 0.5, 1), ("cover", 0, 0), ("cover", 1, 2)])
def test_fit_fill_alignment_preserves_composition(scene, tmp_path, fit, x, color):
    service, p = scene
    out = tmp_path / "fit.mp4"
    before = p.model_dump()
    asyncio.run(
        Renderer(service).render(
            p, out, output_settings={"width": 128, "height": 128, "fit": fit, "x": x, "background": "#ffffff"}
        )
    )
    pixels = frame(out)
    assert pixels[64, 64, color] > 220
    if fit == "contain":
        assert pixels[4, 4].min() > 240
        assert pixels[64, 4, 0] > 220 and pixels[64, 122, 2] > 220
    assert p.model_dump() == before


def test_range_keeps_quality_and_fps_without_second_lossy_encode(scene, tmp_path, monkeypatch):
    service, p = scene
    renderer = Renderer(service)
    run = renderer.run
    commands = []

    async def capture(args, *rest):
        commands.append(args)
        return await run(args, *rest)

    monkeypatch.setattr(renderer, "run", capture)
    out = tmp_path / "range.mp4"
    asyncio.run(
        renderer.render(
            p,
            out,
            from_ms=200,
            to_ms=600,
            output_settings={"width": 384, "height": 128, "fps": 60, "crf": 15},
        )
    )
    assert abs(probe(out)["duration_ms"] - 400) < 30
    stream = json.loads(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=nb_frames,r_frame_rate",
                "-of",
                "json",
                str(out),
            ]
        )
    )["streams"][0]
    assert stream["r_frame_rate"] == "60/1" and stream["nb_frames"] == "24"
    encoding = [c for c in commands if "[vout]" in c]
    assert len(encoding) == 1 and encoding[0][encoding[0].index("-crf") + 1] == "15"
    assert len(commands) == 2  # Prepare once, compose once; no range re-encode.


def test_export_catalog_contract_snapshot_and_conflicts(tmp_path):
    app = create_app(tmp_path / "api", start_worker=False)
    with TestClient(app) as client:
        catalog = client.get("/api/export-presets").json()
        assert len(catalog["presets"]) == 16
        assert len({p["id"] for p in catalog["presets"]}) == 16
        assert next(p for p in catalog["presets"] if p["id"] == "video-2160")["width"] == 3840
        assert catalog["qualities"][0]["crf"] == 18
        p = client.post(
            "/api/projects",
            json={
                "name": "Immutable export",
                "tracks": [
                    {
                        "kind": "text",
                        "name": "Title",
                        "clips": [{"text": "Keep all layers", "duration_ms": 1000}],
                    }
                ],
            },
        ).json()
        base = f"/api/projects/{p['id']}"
        request = {
            "expected_revision": p["revision"],
            "output": {"width": 3840, "height": 2160, "fit": "cover", "fps": 60},
        }
        plan = client.post(base + "/export-plan", json=request)
        assert plan.status_code == 200, plan.text
        assert plan.json()["warnings"][0]["code"] == "composition_crop"
        job = client.post(base + "/renders", json=request)
        assert job.status_code == 202, job.text
        assert job.json()["output"]["width"] == 3840
        assert client.get(base).json() == p
        draft = client.post(base + "/export-plan", json={**request, "quality": "preview"}).json()
        assert (draft["output"]["width"], draft["output"]["height"], draft["output"]["crf"]) == (640, 360, 27)
        for endpoint in ["export-plan", "renders"]:
            assert (
                client.post(base + "/" + endpoint, json={**request, "expected_revision": 999}).status_code
                == 409
            )
            for bad in [
                {"width": 1921},
                {"height": 4096},
                {"fps": 120},
                {"crf": 0},
                {"fit": "stretch"},
                {"x": 2},
            ]:
                assert (
                    client.post(
                        base + "/" + endpoint, json={**request, "output": {**request["output"], **bad}}
                    ).status_code
                    == 422
                )
        headers = {"Accept": "application/json, text/event-stream"}

        def rpc(method, params):
            return client.post(
                "/mcp/", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
            ).json()["result"]

        rpc(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "export-test", "version": "1"},
            },
        )
        tools = {t["name"]: t for t in rpc("tools/list", {})["tools"]}
        assert tools["plan_export"]["annotations"]["readOnlyHint"]
        result = rpc("tools/call", {"name": "get_export_presets", "arguments": {}})
        assert not result.get("isError")
        assert json.loads(result["content"][0]["text"]) == export_catalog().model_dump()
        result = rpc("tools/call", {"name": "start_render", "arguments": {"project_id": p["id"], **request}})
        assert not result.get("isError")
        assert json.loads(result["content"][0]["text"])["output"]["width"] == 3840


def test_source_warning_counts_crop_and_zoom_and_ignores_muted(scene):
    service, p = scene
    report = service.plan_export(p.id, RenderRequest(output=ExportOutput(width=1080, height=1920)))
    assert any(w.code == "source_upscale" for w in report.warnings)
    native = ExportOutput(width=384, height=128)
    assert not export_plan(service, p, native).warnings
    p.tracks[0].clips[0].transform.scale = 4
    assert any(w.code == "source_upscale" for w in export_plan(service, p, native).warnings)
    p.tracks[0].muted = True
    assert not export_plan(service, p, native).warnings


@pytest.mark.parametrize("mode", ["cover", "contain"])
def test_uhd_zoom_crops_correctly_without_oversized_static_intermediates(scene, tmp_path, mode):
    service, p = scene
    p.tracks[0].clips[0].duration_ms = 250
    p.tracks[0].clips[0].transform.scale = 4
    p.tracks[0].clips[0].transform.fit = mode
    p.tracks[0].clips[0].transform.x = 0
    out = tmp_path / "zoom.mp4"
    asyncio.run(Renderer(service).render(p, out, output_settings={"width": 3840, "height": 2160, "fps": 12}))
    pixels = frame(out)
    assert pixels[1080, 1920, 0] > 230  # Left quarter is red; uncropped center is green.
    assert pixels[1080, 1920, 1] < 20
