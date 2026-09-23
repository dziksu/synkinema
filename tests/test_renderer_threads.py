"""Real multi-input FFmpeg commands must not create automatic decoder pools."""

import asyncio
import subprocess

import pytest
from synkinema.media import probe
from synkinema.models import Clip, OutputProfile, Project, Track
from synkinema.renderer import Renderer
from synkinema.service import Service
from synkinema.storage import Store


@pytest.mark.parametrize("input_count", [1, 8])
def test_codec_thread_limits_apply_to_every_input_and_output(tmp_path, monkeypatch, input_count):
    monkeypatch.setenv("SYNKINEMA_FFMPEG_THREADS", "4")
    renderer = Renderer(Service(Store(tmp_path / "data")))
    source = tmp_path / "source.mp4"
    asyncio.run(
        renderer.run(
            [
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=128x128:r=10:d=0.2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(source),
            ]
        )
    )
    calls = []
    create = asyncio.create_subprocess_exec

    async def capture(*args, **kwargs):
        calls.append(args)
        return await create(*args, **kwargs)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", capture)
    output = tmp_path / "result.mp4"
    inputs = [arg for _ in range(input_count) for arg in ["-i", str(source)]]
    graph = "".join(f"[{i}:v]" for i in range(input_count))
    graph += f"concat=n={input_count}:v=1:a=0[out]"
    asyncio.run(
        renderer.run(
            [
                *inputs,
                "-filter_complex",
                graph,
                "-map",
                "[out]",
                "-c:v",
                "libx264",
                str(output),
            ]
        )
    )
    command = calls[0]
    for i, arg in enumerate(command):
        if arg == "-i":
            assert command[i - 2 : i] == ("-threads", str(max(1, 4 // input_count)))
    assert command[command.index(str(output)) - 2 : command.index(str(output))] == ("-threads", "4")
    assert command[command.index("-filter_threads") + 1] == "4"
    result = probe(output)
    assert (result["width"], result["height"]) == (128, 128)
    assert abs(result["duration_ms"] - input_count * 200) < 50


@pytest.mark.asyncio
async def test_many_overlays_are_streamed_through_bounded_file_stages(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNKINEMA_FFMPEG_THREADS", "2")
    monkeypatch.setenv("SYNKINEMA_OVERLAY_BATCH_SIZE", "2")
    service = Service(Store(tmp_path / "data"))
    renderer = Renderer(service)
    source = tmp_path / "source.mp4"
    await renderer.run(
        [
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=128x128:r=12:d=1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(source),
        ]
    )
    asset = service.import_file(source, "Red")
    project = Project(
        name="File-backed overlay staging",
        profile=OutputProfile(width=128, height=128, fps=12, normalize=False),
        tracks=[
            Track(
                id="video",
                name="Video",
                kind="video",
                clips=[Clip(id="base", asset_id=asset["id"], duration_ms=1000)],
            ),
            *[
                Track(
                    id=f"text-{index}",
                    name=f"Text {index}",
                    kind="text",
                    clips=[Clip(id=f"caption-{index}", text=str(index), duration_ms=1000)],
                )
                for index in range(5)
            ],
        ],
    )
    calls = []
    create = asyncio.create_subprocess_exec

    async def capture(*args, **kwargs):
        calls.append(args)
        return await create(*args, **kwargs)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", capture)
    output = tmp_path / "result.mp4"
    await renderer.render(project, output)

    stages = [
        command
        for command in calls
        if ".stage-" in command[command.index("-progress") - 1]
        and command[command.index("-progress") - 1].endswith(".mkv")
    ]
    assert len(stages) == 4  # base plus ceil(5 / 2) overlay passes
    assert max(command.count("-i") for command in stages) <= 3  # prior stage + one bounded batch
    assert not list(tmp_path.glob("result.stage-*.mkv"))
    assert probe(output)["duration_ms"] == pytest.approx(1000, abs=100)


def test_encoded_aac_peak_is_checked_and_corrected_without_reencoding_video(tmp_path):
    renderer = Renderer(Service(Store(tmp_path / "data")))
    output = tmp_path / "hot.mp4"
    profile = OutputProfile(true_peak=-6)
    asyncio.run(
        renderer.run(
            [
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=128x128:r=10:d=3",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=1234:duration=3",
                "-af",
                "volume=6",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                str(output),
            ]
        )
    )
    before = asyncio.run(renderer.measure(output, profile))
    assert float(before["input_tp"]) > profile.true_peak
    original = probe(output)

    def video_hash():
        return subprocess.check_output(
            ["ffmpeg", "-v", "error", "-i", str(output), "-map", "0:v", "-c:v", "copy", "-f", "hash", "-"]
        )

    original_video = video_hash()
    asyncio.run(renderer.protect_audio_peak(output, profile, 3))
    after = asyncio.run(renderer.measure(output, profile))
    assert float(after["input_tp"]) <= profile.true_peak
    assert probe(output)["duration_ms"] == original["duration_ms"]
    assert video_hash() == original_video
    assert not output.with_suffix(".peak.mp4").exists()
