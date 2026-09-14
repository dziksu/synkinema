import asyncio
import subprocess
import wave
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from synkinema.app import create_app
from synkinema.inspection import Inspection
from synkinema.media import probe
from synkinema.models import (
    Animation,
    Clip,
    Keyframe,
    Operation,
    OutputProfile,
    Project,
    RenderRequest,
    Track,
    Transition,
)
from synkinema.renderer import Renderer, validate_timeline
from synkinema.service import Conflict, Service
from synkinema.storage import Store
from synkinema.worker import Worker


@pytest.fixture
def service(tmp_path):
    return Service(Store(tmp_path / "data"))


@pytest.fixture
def media(service, tmp_path):
    result = []
    for name, color in [("red", "#c62522"), ("blue", "#2265c6")]:
        path = tmp_path / f"{name}.png"
        Image.new("RGB", (400, 600), color).save(path)
        result.append(service.import_file(path, name))
    path = tmp_path / "voice.wav"
    sr = 48000
    t = np.arange(sr * 5) / sr
    samples = (np.sin(2 * np.pi * 220 * t) * 0.15 * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(samples.tobytes())
    result.append(service.import_file(path, "Tone"))
    return result


def project_with_media(service, media):
    return service.create(
        Project(
            name="Zażółć gęślą jaźń",
            profile=OutputProfile(width=180, height=320, fps=24),
            tracks=[
                Track(
                    id="v",
                    name="Video",
                    kind="video",
                    clips=[
                        Clip(id="red", asset_id=media[0]["id"], duration_ms=1500),
                        Clip(
                            id="blue",
                            asset_id=media[1]["id"],
                            start_ms=1200,
                            duration_ms=1500,
                            transition=Transition(type="crossfade", duration_ms=300),
                        ),
                    ],
                ),
                Track(
                    id="t",
                    name="Titles",
                    kind="text",
                    clips=[Clip(id="title", text="Życie\nma znaczenie.", duration_ms=2700, font_size=80)],
                ),
                Track(
                    id="a",
                    name="Voice",
                    kind="voiceover",
                    clips=[Clip(id="voice", asset_id=media[2]["id"], duration_ms=2700)],
                ),
            ],
        )
    )


def test_revisions_are_atomic_and_immutable(service):
    p = service.create(Project(name="Original"))
    op = Operation(expected_revision=1, type="update_project", payload={"name": "Updated"})
    updated = service.apply(p.id, op)
    assert updated.revision == 2
    assert service.get(p.id, 1).name == "Original"
    with pytest.raises(Conflict):
        service.apply(p.id, op)
    restored = service.apply(
        p.id, Operation(expected_revision=2, type="restore_revision", payload={"revision": 1})
    )
    assert restored.name == "Original" and restored.revision == 3


def test_concurrent_writes_have_one_winner(service):
    p = service.create(Project(name="Concurrency"))

    def update(i):
        try:
            return service.apply(
                p.id, Operation(expected_revision=1, type="update_project", payload={"name": str(i)})
            ).revision
        except Conflict:
            return "conflict"

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(update, range(4)))
    assert results.count(2) == 1 and results.count("conflict") == 3


def test_import_deduplicates_and_rejects_bad_media(service, media, tmp_path):
    assert len(service.assets()) == 3
    again = service.import_file(tmp_path / "red.png")
    assert again["id"] == media[0]["id"]
    bad = tmp_path / "bad.png"
    bad.write_text("not an image")
    with pytest.raises(ValueError):
        service.import_file(bad)
    with pytest.raises(ValueError):
        service.store.path("../../outside")


def test_split_preserves_source_offset(service, media):
    p = service.create(
        Project(
            name="Split",
            tracks=[
                Track(
                    id="a",
                    name="Audio",
                    kind="voiceover",
                    clips=[Clip(id="c", asset_id=media[2]["id"], duration_ms=2000, speed=2)],
                )
            ],
        )
    )
    p = service.apply(
        p.id,
        Operation(
            expected_revision=1, type="split_clip", payload={"track_id": "a", "clip_id": "c", "time_ms": 700}
        ),
    )
    left, right = p.tracks[0].clips
    assert left.duration_ms == 700 and right.duration_ms == 1300
    assert right.source_in_ms == 1400 and right.start_ms == 700


def test_validation_rolls_back(service, media):
    p = project_with_media(service, media)
    with pytest.raises(ValueError):
        service.apply(
            p.id,
            Operation(
                expected_revision=1,
                type="update_clip",
                payload={"track_id": "a", "clip_id": "voice", "changes": {"duration_ms": 9000}},
            ),
        )
    assert service.get(p.id).revision == 1
    with pytest.raises(ValueError):
        Clip(duration_ms=-1)
    with pytest.raises(ValueError):
        Clip(effects=[{"type": "blur", "value": 900}])
    with pytest.raises(ValueError):
        Clip(
            animations=[
                {"property": "scale", "keyframes": [{"time_ms": 0, "value": 1}, {"time_ms": 0, "value": 2}]}
            ]
        )


def test_rest_and_local_security(tmp_path):
    app = create_app(tmp_path / "api", start_worker=False)
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        p = client.post("/api/projects", json={"name": "API project"}).json()
        assert (
            client.post(
                f"/api/projects/{p['id']}/operations",
                json={"expected_revision": 1, "type": "update_project", "payload": {"name": "Renamed"}},
            ).status_code
            == 200
        )
        assert (
            client.post(
                f"/api/projects/{p['id']}/operations",
                json={"expected_revision": 1, "type": "update_project", "payload": {"name": "Stale"}},
            ).status_code
            == 409
        )
        assert (
            client.post(
                "/api/projects", json={"name": "Evil"}, headers={"Origin": "https://evil.example"}
            ).status_code
            == 403
        )
        assert client.get("/media/synkinema.db").status_code == 404
        assert client.get("/api/projects/nope").status_code == 404
        init = client.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "test", "version": "1"},
                },
            },
        )
        assert init.status_code == 200
        tools = client.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        )
        names = {t["name"] for t in tools.json()["result"]["tools"]}
        assert {"render_frame", "analyze_audio", "apply_operation"} <= names
        result = client.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "get_project", "arguments": {"project_id": p["id"]}},
            },
        )
        assert "Renamed" in result.text


@pytest.mark.asyncio
async def test_real_render_frames_audio_and_cache(service, media, tmp_path):
    p = project_with_media(service, media)
    output = tmp_path / "render.mp4"
    await Renderer(service).render(p, output)
    info = probe(output)
    assert info["width"] == 180 and info["height"] == 320 and info["has_audio"]
    assert abs(info["duration_ms"] - 2700) < 100
    inspection = Inspection(service)
    frame = await inspection.frame(p.id, 500)
    assert frame["revision"] == 1
    with Image.open(frame["path"]) as image:
        assert image.size == (180, 320)
        r, _g, b = image.convert("RGB").getpixel((90, 40))
        assert r > b * 2
    frame2 = await inspection.frame(p.id, 2000)
    with Image.open(frame2["path"]) as image:
        r, _g, b = image.convert("RGB").getpixel((90, 40))
        assert b > r * 2
    sheet = await inspection.sheet(p.id, [500, 2000])
    assert len(sheet["timestamps_ms"]) == 2
    audio = await inspection.audio(p.id)
    assert audio["integrated_lufs"] is not None
    assert abs(audio["integrated_lufs"] + 16) < 1.5
    assert audio["true_peak_dbtp"] <= -1.0
    assert len(audio["windows"]) >= 5
    _, cached = await inspection.preview(p.id)
    modified = cached.stat().st_mtime_ns
    await inspection.frame(p.id, 800)
    assert cached.stat().st_mtime_ns == modified


@pytest.mark.asyncio
async def test_track_gain_and_clip_automation_change_real_output(service, media, tmp_path):
    profile = OutputProfile(width=128, height=128, fps=12, normalize=False)
    clip = Clip(asset_id=media[2]["id"], duration_ms=2000)
    track = Track(id="music", kind="music", name="Music", clips=[clip])
    project = Project(name="Track gain QA", profile=profile, tracks=[track])
    renderer = Renderer(service)
    baseline = tmp_path / "unity.mp4"
    attenuated = tmp_path / "attenuated.mp4"
    await renderer.render(project, baseline)
    track.gain_db = -6
    clip.animations = [
        Animation(
            property="gain_db", keyframes=[Keyframe(time_ms=0, value=-6), Keyframe(time_ms=2000, value=-6)]
        )
    ]
    clip.fade_in_ms = 500
    await renderer.render(project, attenuated)

    def samples(path):
        raw = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "48000",
                "-f",
                "f32le",
                "pipe:1",
            ]
        )
        return np.frombuffer(raw, dtype=np.float32)

    first, second = samples(baseline), samples(attenuated)

    def rms(x):
        return np.sqrt(np.mean(x**2))

    ratio = rms(second[48000:72000]) / rms(first[48000:72000])
    assert abs(20 * np.log10(ratio) + 12) < 0.6
    assert rms(second[2400:4800]) < rms(second[48000:50400]) * 0.3


@pytest.mark.asyncio
async def test_worker_snapshot_cancel_and_restart(service, media):
    p = project_with_media(service, media)
    queued = service.enqueue(p.id, RenderRequest(quality="preview"))
    worker = Worker(service)
    await worker.cancel(queued["id"])
    assert service.store.job(queued["id"])["status"] == "cancelled"
    job = service.enqueue(p.id, RenderRequest(quality="preview"))
    service.apply(
        p.id, Operation(expected_revision=1, type="update_project", payload={"name": "New revision"})
    )
    assert service.store.job(job["id"])["snapshot"]["revision"] == 1
    await worker.start()
    for _ in range(200):
        state = service.store.job(job["id"])
        if state["status"] in ("completed", "failed"):
            break
        await asyncio.sleep(0.1)
    await worker.stop()
    assert state["status"] == "completed", state.get("error")
    assert state["revision"] == 1
    interrupted = service.enqueue(p.id, RenderRequest(quality="preview"))
    service.store.update_job(interrupted["id"], status="running")
    worker2 = Worker(service)
    await worker2.start()
    await worker2.stop()
    assert service.store.job(interrupted["id"])["status"] == "failed"


@pytest.mark.asyncio
async def test_multitrack_audio_timestamps_and_ducking(service, media):
    """Regression: sidechain + delayed voices/SFX must preserve all audio timestamps."""
    p = service.create(
        Project(
            name="Mix regression",
            profile=OutputProfile(width=180, height=320, fps=24),
            tracks=[
                Track(
                    id="v",
                    name="Video",
                    kind="video",
                    clips=[Clip(asset_id=media[0]["id"], duration_ms=6000)],
                ),
                Track(
                    id="voice",
                    name="Voice",
                    kind="voiceover",
                    clips=[
                        Clip(asset_id=media[2]["id"], start_ms=500, duration_ms=1800),
                        Clip(asset_id=media[2]["id"], start_ms=3300, duration_ms=2000),
                    ],
                ),
                Track(
                    id="music",
                    name="Music",
                    kind="music",
                    ducking=True,
                    clips=[Clip(asset_id=media[2]["id"], duration_ms=5000, gain_db=-18)],
                ),
                Track(
                    id="sfx",
                    name="SFX",
                    kind="sound",
                    clips=[
                        Clip(asset_id=media[2]["id"], start_ms=1400, duration_ms=600, gain_db=-9),
                        Clip(asset_id=media[2]["id"], start_ms=5700, duration_ms=300, gain_db=-9),
                    ],
                ),
            ],
        )
    )
    out = service.store.path("renders/mix-regression.mp4")
    await Renderer(service).render(p, out)
    data = probe(out)
    assert abs(data["audio_duration_ms"] - 6000) < 60
    stats = await Renderer(service).measure(out, p.profile)
    assert -17.5 < float(stats["input_i"]) < -14.5
    decoded = service.store.path("cache/regression.wav")
    await Renderer(service).run(["-i", str(out), "-vn", "-ac", "1", "-ar", "48000", str(decoded)])
    with wave.open(str(decoded)) as f:
        data = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(float) / 32768
    assert np.sqrt(np.mean(data[:24000] ** 2)) > 0.001
    assert np.sqrt(np.mean(data[48000:72000] ** 2)) > 0.01
    assert np.sqrt(np.mean(data[round(5.8 * 48000) : round(5.9 * 48000)] ** 2)) > 0.005


@pytest.mark.asyncio
async def test_overlay_opacity_composites_instead_of_blackening(service, media):
    p = service.create(
        Project(
            name="Overlay",
            profile=OutputProfile(width=180, height=320, fps=24),
            tracks=[
                Track(
                    id="v", name="Main", kind="video", clips=[Clip(asset_id=media[0]["id"], duration_ms=1000)]
                ),
                Track(
                    id="o",
                    name="Overlay",
                    kind="overlay",
                    clips=[Clip(asset_id=media[1]["id"], duration_ms=1000, transform={"opacity": 0.5})],
                ),
            ],
        )
    )
    result = await Inspection(service).frame(p.id, 500)
    with Image.open(result["path"]) as image:
        red, _, blue = image.convert("RGB").getpixel((90, 160))
        assert red > 85 and blue > 85
        assert abs(red - blue) < 30


@pytest.mark.asyncio
async def test_tts_cache_and_credentials_stay_server_side(service, media, monkeypatch):
    import httpx
    from synkinema.voices import VoiceRequest, Voices

    request = VoiceRequest(text="Test polskiej narracji.", voice_id="test_voice")
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    with pytest.raises(ValueError, match="ELEVENLABS_API_KEY"):
        await Voices(service).generate(request)
    mp3 = service.store.path("cache/tts-fixture.mp3")
    await Renderer(service).run(["-i", str(service.store.path(media[2]["path"])), "-t", "1", str(mp3)])
    calls = []

    def handle(req):
        calls.append(req)
        return httpx.Response(200, content=mp3.read_bytes())

    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-secret-not-saved")
    voices = Voices(service, transport=httpx.MockTransport(handle))
    first = await voices.generate(request)
    second = await voices.generate(request)
    assert not first["cached"] and second["cached"] and len(calls) == 1
    assert "test-secret-not-saved" not in str(first)
    assert first["asset"]["id"] == second["asset"]["id"]


def test_manual_transition_ripples_aligned_tracks_and_is_reversible(service, media):
    p = service.create(
        Project(
            name="Manual edit",
            tracks=[
                Track(
                    id="v",
                    name="Video",
                    kind="video",
                    clips=[
                        Clip(id="a", asset_id=media[0]["id"], duration_ms=2000),
                        Clip(id="b", asset_id=media[1]["id"], start_ms=2000, duration_ms=2000),
                        Clip(id="c", asset_id=media[0]["id"], start_ms=4000, duration_ms=1000),
                    ],
                ),
                Track(
                    id="t",
                    name="Titles",
                    kind="text",
                    clips=[Clip(text="Aligned", start_ms=2000, duration_ms=2000)],
                ),
            ],
        )
    )
    q = service.apply(
        p.id,
        Operation(
            expected_revision=1,
            type="set_transition",
            payload={
                "track_id": "v",
                "clip_id": "b",
                "transition": {"type": "crossfade", "duration_ms": 300},
            },
        ),
    )
    assert [c.start_ms for c in q.tracks[0].clips] == [0, 1700, 3700]
    assert q.tracks[1].clips[0].start_ms == 1700
    validate_timeline(q)
    r = service.apply(
        p.id,
        Operation(
            expected_revision=2,
            type="set_transition",
            payload={
                "track_id": "v",
                "clip_id": "b",
                "transition": {"type": "cut", "duration_ms": 0},
            },
        ),
    )
    assert [c.start_ms for c in r.tracks[0].clips] == [0, 2000, 4000]
    assert r.tracks[1].clips[0].start_ms == 2000
    with pytest.raises(ValueError, match="previous clip"):
        service.apply(
            p.id,
            Operation(
                expected_revision=3,
                type="set_transition",
                payload={
                    "track_id": "v",
                    "clip_id": "a",
                    "transition": {"type": "crossfade", "duration_ms": 300},
                },
            ),
        )
    assert service.get(p.id).revision == 3


def test_manual_track_order_audio_move_mute_and_empty_removal(service, media):
    p = service.create(
        Project(
            name="Tracks",
            tracks=[
                Track(
                    id="a",
                    name="Sound",
                    kind="sound",
                    clips=[Clip(id="c", asset_id=media[2]["id"], duration_ms=2000, source_in_ms=500)],
                ),
                Track(id="b", name="Music", kind="music"),
                Track(id="v", name="Video", kind="video"),
            ],
        )
    )

    def edit(kind, payload):
        return service.apply(
            p.id, Operation(expected_revision=service.get(p.id).revision, type=kind, payload=payload)
        )

    q = edit("move_clip", {"track_id": "a", "target_track_id": "b", "clip_id": "c", "start_ms": 1000})
    assert not q.tracks[0].clips
    assert q.tracks[1].clips[0].source_in_ms == 500
    q = edit("update_track", {"track_id": "b", "changes": {"muted": True}})
    assert q.tracks[1].muted
    q = edit("reorder_tracks", {"track_ids": ["b", "v", "a"]})
    assert [t.id for t in q.tracks] == ["b", "v", "a"]
    with pytest.raises(ValueError):
        edit("reorder_tracks", {"track_ids": ["b", "b", "a"]})
    with pytest.raises(ValueError, match="Remove or move"):
        edit("remove_track", {"track_id": "b"})
    q = edit("remove_track", {"track_id": "a"})
    assert [t.id for t in q.tracks] == ["b", "v"]
    with pytest.raises(ValueError, match="Visual tracks"):
        edit("move_clip", {"track_id": "b", "target_track_id": "v", "clip_id": "c", "start_ms": 0})
    assert service.get(p.id).revision == q.revision


def test_manual_move_collision_rolls_back_and_trim_bounds_are_enforced(service, media):
    p = service.create(
        Project(
            name="Collision",
            tracks=[
                Track(
                    id="v",
                    name="Video",
                    kind="video",
                    clips=[
                        Clip(id="a", asset_id=media[0]["id"], duration_ms=2000),
                        Clip(id="b", asset_id=media[1]["id"], start_ms=2000, duration_ms=2000),
                    ],
                )
            ],
        )
    )
    with pytest.raises(ValueError, match="Overlapping"):
        service.apply(
            p.id,
            Operation(
                expected_revision=1,
                type="move_clip",
                payload={"track_id": "v", "clip_id": "b", "start_ms": 1000},
            ),
        )
    assert service.get(p.id).revision == 1
    q = service.apply(
        p.id,
        Operation(
            expected_revision=1,
            type="trim_clip",
            payload={"track_id": "v", "clip_id": "a", "changes": {"duration_ms": 1000}},
        ),
    )
    assert q.tracks[0].clips[0].duration_ms == 1000


def test_trimming_tail_keeps_incoming_transition(service, media):
    p = project_with_media(service, media)
    q = service.apply(
        p.id,
        Operation(
            expected_revision=p.revision,
            type="trim_clip",
            payload={
                "track_id": "v",
                "clip_id": "blue",
                "changes": {"duration_ms": 1000, "start_ms": 1200},
            },
        ),
    )
    assert q.tracks[0].clips[1].transition.type == "crossfade"
    validate_timeline(q)
