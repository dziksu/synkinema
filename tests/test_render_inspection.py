"""Inspect exact exports, preserving revision, range and short sound attribution."""

import subprocess

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from synkinema.app import create_app
from synkinema.models import Clip, OutputProfile, Project, RenderRequest, Track


@pytest.fixture
def context(tmp_path):
    app = create_app(tmp_path / "data", start_worker=False)
    service = app.state.service
    source = tmp_path / "sound.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "1", str(source)],
        check=True,
    )
    asset = service.import_file(source)
    project = service.create(
        Project(
            name="Pinned export",
            profile=OutputProfile(width=128, height=128, fps=12, normalize=False),
            tracks=[
                Track(name="Titles", kind="text", clips=[Clip(text="Timeline", duration_ms=4000)]),
                Track(
                    name="Short SFX",
                    kind="sound",
                    clips=[Clip(asset_id=asset["id"], start_ms=2250, duration_ms=100)],
                ),
                Track(
                    name="Muted SFX",
                    kind="sound",
                    muted=True,
                    clips=[Clip(asset_id=asset["id"], start_ms=2250, duration_ms=100)],
                ),
            ],
        )
    )
    job = service.enqueue(project.id, RenderRequest(from_ms=2000, to_ms=3000))
    output = service.store.path(f"renders/{job['id']}.mp4")
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=128x128:r=12:d=0.5",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=128x128:r=12:d=0.5",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0[v]",
            "-map",
            "[v]",
            "-map",
            "2:a",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(output),
        ],
        check=True,
    )
    service.store.update_job(job["id"], status="completed")
    with TestClient(app) as client:
        yield client, service, project, job, output


def test_exact_range_frames_and_sheet(context):
    c, service, p, job, _ = context
    base = f"/api/projects/{p.id}/inspection"

    # Job owns revision even when the caller supplies a nonexistent revision.
    def inspect(ms):
        r = c.post(base + "/frame", json={"job_id": job["id"], "revision": 999, "time_ms": ms})
        assert r.status_code == 200, r.text
        result = r.json()
        assert (result["revision"], result["job_id"], result["output_time_ms"]) == (1, job["id"], ms - 2000)
        with Image.open(result["path"]) as image:
            return np.asarray(image).mean(axis=(0, 1))

    red, blue = inspect(2100), inspect(2999)
    assert red[0] > red[2] * 5 and blue[2] > blue[0] * 5
    for ms in [0, 1999, 3000, 4000]:
        assert c.post(base + "/frame", json={"job_id": job["id"], "time_ms": ms}).status_code == 422
    sheet = c.post(base + "/sheet", json={"job_id": job["id"]}).json()
    assert sheet["timestamps_ms"] == [2000]  # Timeline midpoint is included at range start.
    assert (sheet["from_ms"], sheet["to_ms"], sheet["revision"]) == (2000, 3000, 1)
    assert (
        c.post(base + "/sheet", json={"job_id": job["id"], "timestamps_ms": [2100, 3100]}).status_code == 422
    )
    assert (
        c.post(base + "/sheet", json={"job_id": job["id"], "timestamps_ms": [2100] * 25}).status_code == 422
    )
    other = service.create(Project(name="Other"))
    assert (
        c.post(
            f"/api/projects/{other.id}/inspection/frame", json={"job_id": job["id"], "time_ms": 2100}
        ).status_code
        == 422
    )


def test_missing_or_pending_job_never_falls_back(context):
    c, service, p, job, output = context
    base = f"/api/projects/{p.id}/inspection"
    service.store.update_job(job["id"], status="running")
    assert c.post(base + "/frame", json={"job_id": job["id"], "time_ms": 2100}).status_code == 422
    service.store.update_job(job["id"], status="completed")
    output.unlink()
    for endpoint in ["frame", "sheet", "audio"]:
        r = c.post(base + "/" + endpoint, json={"job_id": job["id"]})
        assert r.status_code == 422 and "unavailable" in r.json()["detail"]


def test_range_default_fallback_and_short_audio_windows(context):
    c, service, p, job, _ = context
    request = dict(job["request"], from_ms=2100, to_ms=3100)
    service.store.update_job(job["id"], request=request)
    base = f"/api/projects/{p.id}/inspection"
    sheet = c.post(base + "/sheet", json={"job_id": job["id"]}).json()
    assert sheet["timestamps_ms"] == [2600]  # No project midpoint in this range.
    r = c.post(base + "/audio", json={"job_id": job["id"], "revision": 999})
    assert r.status_code == 200, r.text
    audio = r.json()
    assert audio["job_id"] == job["id"] and audio["from_ms"] == 2100
    assert audio["windows"][0]["active_tracks"] == ["Short SFX"]
    assert audio["windows"][1]["active_tracks"] == []
    assert audio["windows"][0]["duration_ms"] == 500


def test_speech_gap_dynamics_and_masking_warning():
    from synkinema.inspection import speech_gap_dynamics, speech_gap_warning
    from synkinema.models import Project

    project = Project(name="Mix")
    names = {t.kind: t.name for t in project.tracks}
    voice, music = names["voiceover"], names["music"]

    def window(rms, *tracks):
        return {"rms_dbfs": rms, "active_tracks": list(tracks)}

    # Healthy mix measured on a published Short: gaps ~14 dB under speech.
    healthy = [
        window(-14, voice, music),
        window(-28, music),
        window(-15, voice, music),
        window(-27, music),
    ] * 5
    dynamics = speech_gap_dynamics(healthy)
    assert dynamics["window_ms"] == 500 and dynamics["audible_windows"] == 20
    assert dynamics["separation_db"] >= 12
    assert speech_gap_warning(project, healthy, dynamics) is None
    masked = [window(-14, voice, music), window(-18, music)] * 10
    warning = speech_gap_warning(project, masked, speech_gap_dynamics(masked))
    assert warning["type"] == "bed_fills_speech_gaps"
    # Continuous speech without a bed is not a masking problem.
    talk = [window(-14, voice), window(-17, voice)] * 10
    assert speech_gap_warning(project, talk, speech_gap_dynamics(talk)) is None
    assert speech_gap_dynamics([window(-80), window(-14, voice)]) is None
