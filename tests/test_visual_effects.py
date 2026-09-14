"""Pixel-level regressions for real FFmpeg effects, zoom and every advertised transition."""

import subprocess

import numpy as np
import pytest
from PIL import Image, ImageDraw
from synkinema.media import probe
from synkinema.models import Clip, OutputProfile, Project, Track, Transition
from synkinema.renderer import TRANSITIONS, Renderer
from synkinema.service import Service
from synkinema.storage import Store


def frame(path, time, width=192, height=256):
    raw = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-ss",
            str(time),
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ]
    )
    return np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3).astype(float)


def edges(image):
    return np.abs(np.diff(image, axis=0)).mean() + np.abs(np.diff(image, axis=1)).mean()


@pytest.fixture
def visual_fixture(tmp_path):
    service = Service(Store(tmp_path / "data"))
    y, x = np.mgrid[:384, :512]
    checker = ((x // 12 + y // 12) % 2) * 65
    pixels = np.stack([70 + checker + x / 9, 65 + checker + y / 10, 100 + checker], axis=-1).astype(np.uint8)
    image = Image.fromarray(pixels)
    ImageDraw.Draw(image).rectangle((225, 165, 285, 225), fill=(245, 25, 25))
    source = tmp_path / "pattern.png"
    image.save(source)
    asset = service.import_file(source)
    return service, asset, OutputProfile(width=192, height=256, fps=24, crf=15, normalize=False)


@pytest.mark.asyncio
async def test_real_effects_change_pixels_and_disabled_effect_is_neutral(visual_fixture):
    service, asset, profile = visual_fixture
    renderer = Renderer(service)
    clip = Clip(asset_id=asset["id"], duration_ms=1000)
    baseline = frame(await renderer.visual_clip(clip, profile), 0.5)
    values = {
        "blur": 6,
        "brightness": 0.2,
        "contrast": 1.5,
        "saturation": 0.2,
        "grayscale": 1,
        "vignette": 0.8,
        "sharpen": 2,
    }
    result = {}
    for name, value in values.items():
        effect_clip = Clip(asset_id=asset["id"], duration_ms=1000, effects=[{"type": name, "value": value}])
        result[name] = frame(await renderer.visual_clip(effect_clip, profile), 0.5)
        assert np.abs(result[name] - baseline).mean() > 1, name
    assert edges(result["blur"]) < edges(baseline) * 0.6
    assert result["brightness"].mean() > baseline.mean() + 20
    assert result["contrast"].std() > baseline.std() * 1.15
    chroma = lambda im: np.ptp(im, axis=2).mean()
    assert chroma(result["saturation"]) < chroma(baseline) * 0.4
    assert chroma(result["grayscale"]) < 2
    assert result["vignette"][:35, :35].mean() < baseline[:35, :35].mean() * 0.8
    assert edges(result["sharpen"]) > edges(baseline) * 1.1
    disabled = Clip(
        asset_id=asset["id"], duration_ms=1000, effects=[{"type": "blur", "value": 30, "enabled": False}]
    )
    assert np.abs(frame(await renderer.visual_clip(disabled, profile), 0.5) - baseline).mean() < 0.1


@pytest.mark.asyncio
async def test_animated_zoom_enlarges_subject_and_opacity_reaches_keyframes(visual_fixture):
    service, asset, profile = visual_fixture
    renderer = Renderer(service)
    clip = Clip(
        asset_id=asset["id"],
        duration_ms=1000,
        animations=[
            {
                "property": "scale",
                "keyframes": [
                    {"time_ms": 0, "value": 1},
                    {"time_ms": 900, "value": 1.65, "easing": "ease_in_out"},
                ],
            }
        ],
    )
    path = await renderer.visual_clip(clip, profile)
    first, last = frame(path, 0), frame(path, 0.95)

    def red_area(im):
        return ((im[:, :, 0] > 215) & (im[:, :, 1] < 60) & (im[:, :, 2] < 60)).sum()

    assert red_area(last) > red_area(first) * 2
    opacity = Clip(
        asset_id=asset["id"],
        duration_ms=1000,
        animations=[
            {
                "property": "opacity",
                "keyframes": [{"time_ms": 0, "value": 0.15}, {"time_ms": 800, "value": 1}],
            }
        ],
    )
    path = await renderer.visual_clip(opacity, profile)
    assert frame(path, 0.9).mean() > frame(path, 0).mean() * 3


@pytest.mark.asyncio
@pytest.mark.parametrize("transition", list(TRANSITIONS))
async def test_every_transition_renders_correct_duration_and_reaches_next_clip(
    visual_fixture, tmp_path, transition
):
    service, first, profile = visual_fixture
    second_file = tmp_path / "blue.png"
    Image.new("RGB", (512, 384), (25, 55, 210)).save(second_file)
    second = service.import_file(second_file)
    p = Project(
        name=f"Transition {transition}",
        profile=profile,
        tracks=[
            Track(
                name="Video",
                kind="video",
                clips=[
                    Clip(asset_id=first["id"], duration_ms=1000),
                    Clip(
                        asset_id=second["id"],
                        start_ms=600,
                        duration_ms=1000,
                        transition=Transition(type=transition, duration_ms=400),
                    ),
                ],
            )
        ],
    )
    out = tmp_path / f"{transition}.mp4"
    await Renderer(service).render(p, out)
    assert abs(probe(out)["duration_ms"] - 1600) < 70
    before, during, after = frame(out, 0.4), frame(out, 0.8), frame(out, 1.3)
    assert after[:, :, 2].mean() > after[:, :, 0].mean() * 4
    assert np.abs(during - before).mean() > 3
    assert np.abs(during - after).mean() > 3


@pytest.mark.asyncio
async def test_grayscale_intensity_preserves_zero_and_interpolates(visual_fixture):
    service, asset, profile = visual_fixture
    renderer = Renderer(service)
    images = []
    for value in (0, 0.5, 1):
        clip = Clip(asset_id=asset["id"], duration_ms=1000, effects=[{"type": "grayscale", "value": value}])
        images.append(frame(await renderer.visual_clip(clip, profile), 0.5))
    baseline = frame(await renderer.visual_clip(Clip(asset_id=asset["id"], duration_ms=1000), profile), 0.5)
    assert np.abs(images[0] - baseline).mean() < 1
    chroma = [np.ptp(im, axis=2).mean() for im in images]
    assert chroma[0] * 0.35 < chroma[1] < chroma[0] * 0.65
    assert chroma[2] < 2


@pytest.mark.asyncio
async def test_zoom_transition_preserves_detail_at_midpoint(visual_fixture, tmp_path):
    service, asset, profile = visual_fixture
    p = Project(
        name="Bounded zoom",
        profile=profile,
        tracks=[
            Track(
                name="Video",
                kind="video",
                clips=[
                    Clip(asset_id=asset["id"], duration_ms=1000),
                    Clip(
                        asset_id=asset["id"],
                        start_ms=500,
                        duration_ms=1000,
                        transition=Transition(type="zoom", duration_ms=500),
                    ),
                ],
            )
        ],
    )
    out = tmp_path / "zoom-detail.mp4"
    await Renderer(service).render(p, out)
    baseline = frame(out, 0.4)
    for time in (0.7, 0.75, 0.8):
        current = frame(out, time)
        assert edges(current) > edges(baseline) * 0.35, time
        assert np.abs(current - baseline).mean() > 1, "Zoom must visibly change framing"


@pytest.mark.asyncio
async def test_inspection_replaces_preview_frame_with_completed_final(visual_fixture):
    from synkinema.inspection import Inspection
    from synkinema.models import RenderRequest

    service, asset, _ = visual_fixture
    project = service.create(
        Project(
            name="Preview to final",
            profile=OutputProfile(width=720, height=960, fps=24, normalize=False),
            tracks=[Track(name="Video", kind="video", clips=[Clip(asset_id=asset["id"], duration_ms=1000)])],
        )
    )
    inspection = Inspection(service)
    first = await inspection.frame(project.id, 500)
    with Image.open(first["path"]) as image:
        assert max(image.size) <= 640
    job = service.enqueue(project.id, RenderRequest(quality="final"))
    final = service.store.path(f"renders/{job['id']}.mp4")
    await Renderer(service).render(project, final)
    service.store.update_job(job["id"], status="completed")
    second = await inspection.frame(project.id, 500)
    assert second["path"] != first["path"]
    with Image.open(second["path"]) as image:
        assert image.size == (720, 960)
    assert (await inspection.frame(project.id, 500))["path"] == second["path"]
