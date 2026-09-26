"""Actual decoded frames guard window boundaries, clocks and bounded work."""

import asyncio
import math
import subprocess
from itertools import pairwise

import pytest
from synkinema.models import Clip, OutputProfile, Track
from synkinema.renderer import Renderer, overlay_windows
from synkinema.service import Service
from synkinema.storage import Store


def decoded_hashes(path):
    data = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v", "-f", "framemd5", "-"]
    ).decode()
    return [line.split(",")[-1].strip() for line in data.splitlines() if not line.startswith("#")]


def test_sequential_captions_process_each_frame_once():
    track = Track(name="Captions", kind="text")
    layers = [(track, Clip(start_ms=i * 1600, duration_ms=1600, text=str(i))) for i in range(228)]
    windows = list(overlay_windows(layers, 364800, 30, 12))
    assert windows[0][0] == 0 and windows[-1][1] == 10944
    assert all(a[1] == b[0] for a, b in pairwise(windows))
    assert all(len(layers) <= 12 for _, _, layers in windows)
    work = sum((b - a) * math.ceil(len(layers) / 12) for a, b, layers in windows)
    assert work == 10944  # Formerly 19 * 10944 frames, excluding primary and final encode.


@pytest.mark.asyncio
@pytest.mark.parametrize("fps", [12, 25, 30])
async def test_window_frames_match_unsplit_layers_with_fades_animation_and_video(tmp_path, fps):
    renderer = Renderer(Service(Store(tmp_path / "data")))
    renderer.overlay_batch_size = 2
    profile = OutputProfile(width=128, height=128, fps=fps, normalize=False)
    source = tmp_path / "base.mkv"
    await renderer.run(
        [
            "-f",
            "lavfi",
            "-i",
            f"testsrc2=s=128x128:r={fps}:d=4",
            *renderer._stage_codec(source),
        ]
    )
    text = Track(name="Captions", kind="text")
    overlay = Track(name="Overlay", kind="overlay")
    layers = [
        (
            text,
            Clip(text=str(i), start_ms=137 + i * 431, duration_ms=431, font_size=20, text_auto_center=True),
        )
        for i in range(7)
    ]
    # Long graphics straddle several windows and overlap each other. Order must
    # remain track order, not a temporal sort of the layers.
    layers += [
        (
            overlay,
            Clip(
                shape="rectangle",
                start_ms=123,
                duration_ms=3200,
                placement={"width": 0.4, "height": 0.4},
                color="#00ff00",
                fade_in_ms=750,
                fade_out_ms=950,
                animations=[
                    {
                        "property": "opacity",
                        "keyframes": [{"time_ms": 0, "value": 0.2}, {"time_ms": 3200, "value": 0.8}],
                    }
                ],
            ),
        )
    ]
    video = Clip(
        id="moving-overlay",
        asset_id="test",
        start_ms=217,
        duration_ms=3000,
        placement={"x": 0.25, "y": 0.25, "width": 0.4, "height": 0.4},
        fade_in_ms=600,
        fade_out_ms=850,
    )
    layers.append((overlay, video))
    rendered = {video.id: source}
    reference = tmp_path / "reference.mkv"
    await renderer._apply_overlay_batch(source, layers, rendered, profile, 4, reference, None)
    result = tmp_path / "windowed.mkv"
    progress = []
    await renderer._compose_overlays(source, layers, rendered, profile, 4000, result, progress.append)
    expected, actual = decoded_hashes(reference), decoded_hashes(result)
    assert len(actual) == len(expected) == fps * 4
    assert actual == expected
    assert progress == sorted(progress) and progress[-1] == 1
    assert not list(tmp_path.glob("*.window-*.mkv"))
    assert not list(tmp_path.glob("*.concat.txt"))


@pytest.mark.asyncio
async def test_empty_windows_and_long_lived_layer_keep_every_frame(tmp_path):
    renderer = Renderer(Service(Store(tmp_path / "data")))
    profile = OutputProfile(width=128, height=128, fps=30, normalize=False)
    source = tmp_path / "base.mkv"
    await renderer.run(
        [
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=128x128:r=30:d=62.133",
            *renderer._stage_codec(source),
        ]
    )
    track = Track(name="Caption", kind="text")
    layers = [
        (
            track,
            Clip(
                text="Long",
                start_ms=31137,
                duration_ms=30000,
                fade_in_ms=1000,
                fade_out_ms=2000,
                font_size=20,
            ),
        )
    ]
    reference, result = tmp_path / "reference.mkv", tmp_path / "result.mkv"
    await renderer._apply_overlay_batch(source, layers, {}, profile, 62.133, reference, None)
    await renderer._compose_overlays(source, layers, {}, profile, 62133, result, lambda _: None)
    assert decoded_hashes(reference) == decoded_hashes(result)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [RuntimeError, asyncio.CancelledError])
async def test_window_failure_cleans_own_intermediates_preserves_source(tmp_path, monkeypatch, failure):
    renderer = Renderer(Service(Store(tmp_path / "data")))
    source = tmp_path / "base.mkv"
    source.write_bytes(b"source must survive")
    output = tmp_path / "result.mkv"

    async def fail(*args, **kwargs):
        args[5].write_bytes(b"partial stage")
        raise failure()

    monkeypatch.setattr(renderer, "_apply_overlay_batch", fail)
    with pytest.raises(failure):
        await renderer._compose_overlays(source, [], {}, OutputProfile(), 1000, output, lambda _: None)
    assert source.read_bytes() == b"source must survive"
    assert not output.exists()
    assert not list(tmp_path.glob("*.window-*.mkv"))
    assert not list(tmp_path.glob("*.concat.txt"))


def rgb_at(path, frame, x, y, size=128):
    data = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            f"select=eq(n\\,{frame})",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ]
    )
    offset = (y * size + x) * 3
    return tuple(data[offset : offset + 3])


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["shape", "video"])
async def test_off_frame_layer_keeps_its_last_frame_and_the_final_frame(tmp_path, kind):
    """A layer whose clock sits just before frame boundaries must not vanish on its last frame.

    FFmpeg places a finished secondary input's EOF one tick after its last
    frame. With eof_action=pass, the final covered canvas frame (and every
    layer ending with the film) was passed through bare, producing a one-frame
    flash at cuts and a background-only final frame.
    """
    renderer = Renderer(Service(Store(tmp_path / "data")))
    profile = OutputProfile(width=128, height=128, fps=30, normalize=False)
    source = tmp_path / "base.mkv"
    # 1.633 s -> 49 canvas frames; frame 48 (1.600 s) is the final frame.
    await renderer.run(
        ["-f", "lavfi", "-i", "color=c=black:s=128x128:r=30:d=1.633", *renderer._stage_codec(source)]
    )
    track = Track(name="Layer", kind="overlay")
    rendered = {}
    if kind == "shape":
        clip = Clip(shape="rectangle", start_ms=933, duration_ms=700, color="#00ff00")
    else:
        green = tmp_path / "green.mkv"
        await renderer.run(
            [
                "-f",
                "lavfi",
                "-i",
                "color=c=0x00ff00:s=128x128:r=30:d=0.7",
                "-pix_fmt",
                "bgra",
                "-c:v",
                "ffv1",
                str(green),
            ]
        )
        clip = Clip(id="green", asset_id="green", start_ms=933, duration_ms=700)
        rendered[clip.id] = green
    # A second layer ends mid-film on the same off-frame clock (a cut).
    cut = Clip(
        shape="rectangle",
        start_ms=233,
        duration_ms=500,
        color="#ff0000",
        placement={"x": 0.25, "width": 0.25},
    )
    result = tmp_path / "result.mkv"
    await renderer._compose_overlays(
        source, [(track, clip), (track, cut)], rendered, profile, 1633, result, lambda _: None
    )
    assert len(decoded_hashes(result)) == 49

    def is_green(frame):
        r, g, b = rgb_at(result, frame, 96, 64)
        return g > 200 and r < 60 and b < 60

    def is_red(frame):
        r, g, b = rgb_at(result, frame, 32, 64)
        return r > 200 and g < 60 and b < 60

    assert not is_green(27) and is_green(28)  # 0.933 s starts on canvas frame 28 (0.9333 s)
    assert is_green(48)  # the film's final frame keeps every layer
    # Red covers 0.233-0.733 s: canvas frames 7..21; frame 21 (0.700 s) is its last.
    assert not is_red(6) and is_red(7) and is_red(21) and not is_red(22)
