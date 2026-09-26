"""Production regressions: transport safety, real artifacts, task/revision semantics and MCP workflow."""

import asyncio
import base64
import io
import json
import socket
import wave

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from synkinema.app import create_app
from synkinema.models import Clip, Project
from synkinema.production import remote, transcription
from synkinema.production.contracts import (
    ComposeReel,
    NarrationTake,
    PrepareNarration,
    ProductionResult,
    SourceInspection,
    StartProduction,
    Transcribe,
    WordTiming,
)
from synkinema.production.layout import caption_layout, inspect_source
from synkinema.production.routes import compose_task
from synkinema.service import Conflict


def speech_bytes():
    out = io.BytesIO()
    with wave.open(out, "wb") as f:
        f.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        f.writeframes((np.sin(np.arange(24000) * 2 * np.pi * 220 / 16000) * 6000).astype("<i2").tobytes())
    return out.getvalue()


@pytest.fixture
def env(tmp_path):
    app = create_app(tmp_path / "data", start_worker=False)
    p = app.state.production
    project = p.service.create(Project(name="QA production"))
    yield app, p, project
    p.store.engine.dispose()


def req(project, key="task-key-0001", **kw):
    return StartProduction(
        request_key=key,
        request={"type": "generate_score", "project_id": project.id, "duration_ms": 1000, **kw},
    )


@pytest.mark.asyncio
async def test_task_idempotency_partial_wait_cancel_and_real_score(env):
    _, p, project = env
    await p.start()
    try:
        task = p.enqueue(req(project))
        assert p.enqueue(req(project)).id == task.id
        with pytest.raises(Conflict):
            p.enqueue(req(project, bpm=120))
        result = await p.wait(task.id, 5)
        assert result.status == "completed" and result.result.assets[0].duration_ms == 1000
        assert p.store.path(result.result.assets[0].path).is_file()
        assert p.cancel(task.id).status == "completed"
        queued = p.enqueue(req(project, "cancel-queued"))
        assert p.cancel(queued.id).status == "cancelled"
        assert (await p.wait(queued.id, 0)).result.assets == []
        assert not list(p.store.path("uploads").iterdir())
    finally:
        await p.stop()


@pytest.mark.asyncio
async def test_running_cancel_stops_process_preserves_partial_and_next_task(env, monkeypatch):
    _, p, project = env
    original = p.execute
    started = asyncio.Event()

    async def slow(task, work):
        if task.request_key == "slow-cancel-key":
            started.set()
            await p.run(
                ["ffmpeg", "-v", "error", "-re", "-f", "lavfi", "-i", "sine=duration=30", "-f", "null", "-"]
            )
        else:
            await original(task, work)

    monkeypatch.setattr(p, "execute", slow)
    await p.start()
    try:
        a = p.enqueue(req(project, "slow-cancel-key"))
        await asyncio.wait_for(started.wait(), 5)
        assert p.cancel(a.id).cancel_requested
        assert (await p.wait(a.id, 5)).status == "cancelled"
        b = p.enqueue(req(project, "after-cancel-key"))
        assert (await p.wait(b.id, 5)).status == "completed"
    finally:
        await p.stop()


@pytest.mark.asyncio
async def test_failed_tasks_remain_failed_on_retry_and_restart_is_honest(env, monkeypatch):
    _, p, project = env
    pending = p.enqueue(req(project, "before-restart"))
    await p.start()
    try:
        assert p.get(pending.id).status == "failed"
        assert "restart" in p.get(pending.id).error

        async def failure(task, work):
            raise RuntimeError("Provider unavailable")

        monkeypatch.setattr(p, "execute", failure)
        t = p.enqueue(req(project, "fail-task-key"))
        assert (await p.wait(t.id, 3)).error == "Provider unavailable"
        assert p.enqueue(req(project, "fail-task-key")).id == t.id
    finally:
        await p.stop()


def test_transcript_alignment_preserves_authored_names_and_refuses_wrong_text():
    words = [
        WordTiming(word=w, start_ms=i * 300, end_ms=(i + 1) * 300)
        for i, w in enumerate(["In", "Halloween", "stock", "your", "victims"])
    ]
    t = transcription.align(words, "In Halloween stalk your victims", "en", "tiny.en")
    assert t.match_ratio == 0.8
    assert t.aligned_words[2].word == "stalk" and t.aligned_words[2].estimated
    assert t.text == "In Halloween stock your victims"
    bad = transcription.align(words, "This entirely unrelated sentence is incorrect", "en", "tiny.en")
    assert not bad.aligned_words and bad.warnings
    silent = transcription.align([], "Hello", "en", "tiny.en")
    assert silent.speech_end_ms == 0 and not silent.aligned_words
    with pytest.raises(ValueError):
        Transcribe(asset_id="x", language="pl")
    with pytest.raises(ValueError):
        Transcribe(asset_id="x", job_id="y")
    with pytest.raises(ValueError):
        PrepareNarration(project_id="x", lines=[{"id": "a", "text": "Hi"}, {"id": "a", "text": "Hi"}])


@pytest.mark.asyncio
async def test_public_transport_pins_dns_and_rejects_redirect_to_private(monkeypatch):
    calls = []

    async def resolve(url):
        if "private.invalid" in url:
            raise ValueError("Private network blocked")
        return "93.184.216.34"

    monkeypatch.setattr(remote, "resolve_public", resolve)

    def handler(request):
        calls.append(request)
        assert request.url.host == "93.184.216.34"
        assert request.headers["host"] == "public.invalid"
        assert request.extensions["sni_hostname"] == "public.invalid"
        return httpx.Response(302, headers={"location": "http://private.invalid/private"})

    Client = httpx.AsyncClient
    monkeypatch.setattr(
        remote.httpx, "AsyncClient", lambda **kw: Client(transport=httpx.MockTransport(handler), **kw)
    )
    with pytest.raises(ValueError, match="Private"):
        await remote.download("https://public.invalid/movie.mp4")
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_dns_mixed_private_answers_and_download_limits(monkeypatch):
    async def lookup(*a, **kw):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 80)),
        ]

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", lookup)
    with pytest.raises(ValueError, match="Private"):
        await remote.resolve_public("https://public.invalid/x")
    for url in [
        "file:///etc/passwd",
        "http://user:pass@example.com/a",
        "http://example.com:8080/a",
        "http://example.com/a#frag",
    ]:
        with pytest.raises(ValueError):
            remote.public_url(url)

    async def safe(url):
        return "93.184.216.34"

    monkeypatch.setattr(remote, "resolve_public", safe)
    Client = httpx.AsyncClient
    monkeypatch.setattr(
        remote.httpx,
        "AsyncClient",
        lambda **kw: Client(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"0123456789")), **kw
        ),
    )
    with pytest.raises(ValueError, match="limit"):
        await remote.download("https://example.com/file", limit=5)


def test_hls_nested_sources_and_unsupported_playlists():
    body = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\none.m4s\n#EXTINF:2,\n../two.m4s\n#EXT-X-ENDLIST\n'
    init, rows = remote.segments(body, "https://cdn.example/a/list.m3u8")
    assert init == "https://cdn.example/a/init.mp4"
    assert rows == [(0, 2000, "https://cdn.example/a/one.m4s"), (2000, 4000, "https://cdn.example/two.m4s")]
    for extra in ['#EXT-X-KEY:METHOD=AES-128,URI="x"\n', "#EXT-X-BYTERANGE:10\n"]:
        with pytest.raises(ValueError):
            remote.segments(extra + body, "https://example.com/a")
    with pytest.raises(ValueError, match="live"):
        remote.segments(body.replace("#EXT-X-ENDLIST", ""), "https://example.com/a")
    with pytest.raises(ValueError):
        remote.segments(body.replace("#EXTINF:2,", "#EXTINF:nan,"), "https://example.com/a")


def test_caption_layout_detects_actual_clipping_and_collisions(env):
    _, p, project = env
    textclips = [
        Clip(id="one", text="W" * 500, duration_ms=3000, font_size=150),
        Clip(id="two", text="Collision", duration_ms=3000, font_size=70),
    ]
    project.tracks[1].clips = textclips[:1]
    project.tracks.append(project.tracks[1].model_copy(update={"id": "other", "clips": textclips[1:]}))
    result = caption_layout(p.service, project)
    assert not result.passed
    assert any(x.clipped for x in result.items)
    assert any(x["code"] == "caption_collision" for x in result.issues)


def install_measured_take(p, project, tmp_path):
    source = tmp_path / "voice.wav"
    source.write_bytes(speech_bytes())
    asset = p.service.import_file(source, project_id=project.id)
    words = [
        WordTiming(word=w, start_ms=i * 200, end_ms=(i + 1) * 200)
        for i, w in enumerate(["Three", "new", "games", "to", "play"])
    ]
    tr = transcription.align(words, "Three new games to play", "en", "tiny.en")
    task = p.enqueue(
        StartProduction(
            request_key="measured-narration",
            request={
                "type": "prepare_narration",
                "project_id": project.id,
                "lines": [{"id": "one", "text": "Three new games to play"}],
            },
        )
    )
    p.update(
        task,
        status="completed",
        phase="Complete",
        progress=1,
        result=ProductionResult(
            narration=[NarrationTake(id="one", text="Three new games to play", asset=asset, transcript=tr)]
        ),
    )
    image = tmp_path / "frame.png"
    Image.new("RGB", (640, 360), "green").save(image)
    visual = p.service.import_file(image, project_id=project.id)
    return task, visual


def test_showcase_plan_commit_conflict_and_no_implicit_overwrite(env, tmp_path):
    _, p, project = env
    task, asset = install_measured_take(p, project, tmp_path)
    r = ComposeReel(
        expected_revision=1,
        narration_task_id=task.id,
        beats=[
            {
                "id": "one",
                "title": "Three new horrors",
                "duration_ms": 3000,
                "shots": [{"asset_id": asset["id"]}],
            }
        ],
    )
    planned = compose_task(p, project.id, r)
    assert not planned.committed and p.service.get(project.id).revision == 1
    assert p.service.get(project.id).script_lines == []
    line = planned.project.script_lines[0]
    assert line.id == "one" and line.audio_source == "generated"
    assert line.audio_asset_id == p.get(task.id).result.narration[0].asset.id
    assert line.audio_text == line.text == "Three new games to play"
    assert planned.layout.passed
    actual = compose_task(p, project.id, r.model_copy(update={"dry_run": False}))
    assert actual.committed and actual.project.revision == 2
    assert actual.project.script_lines == planned.project.script_lines
    assert len(actual.project.tracks) == 9 and actual.project.duration_ms == 3000
    with pytest.raises(ValueError, match="not empty"):
        compose_task(p, project.id, r)
    with pytest.raises(Conflict):
        compose_task(p, project.id, r.model_copy(update={"dry_run": False, "replace_existing": True}))
    assert p.service.get(project.id).revision == 2
    replaced = compose_task(
        p,
        project.id,
        r.model_copy(update={"dry_run": False, "replace_existing": True, "expected_revision": 2}),
    )
    assert replaced.project.revision == 3 and len(replaced.project.tracks) == 9
    assert p.service.get(project.id, 2).revision == 2  # undo/history remains intact


@pytest.mark.asyncio
async def test_source_sheet_requires_source_bounds_and_cleans_temp(env, tmp_path):
    _, p, project = env
    image = tmp_path / "frame.png"
    Image.new("RGB", (320, 180), "red").save(image)
    asset = p.service.import_file(image, project_id=project.id)
    result = await inspect_source(p.service, SourceInspection(asset_id=asset["id"], count=1), p.run)
    assert result.timestamps_ms == [0]
    assert p.store.path(result.url.removeprefix("/media/")).is_file()
    assert not list(p.store.path("cache").glob("*-source-*.png"))
    with pytest.raises(ValueError):
        await inspect_source(p.service, SourceInspection(asset_id=asset["id"], timestamps_ms=[10]), p.run)


def test_full_mcp_transport_workflow_real_render_verification_and_bundle(tmp_path, monkeypatch):
    app = create_app(tmp_path / "mcp", start_worker=True)
    p = app.state.production

    async def fake_generate(request):
        source = tmp_path / "take.wav"
        source.write_bytes(speech_bytes())
        return {"asset": p.service.import_file(source, project_id=request.project_id), "cached": False}

    async def measured(request, work):
        words = [
            WordTiming(word=w, start_ms=i * 200, end_ms=(i + 1) * 200)
            for i, w in enumerate(request.reference_text.split())
        ]
        return transcription.align(words, request.reference_text, request.language, request.model)

    monkeypatch.setattr(p.voices, "generate", fake_generate)
    monkeypatch.setattr(p, "recognize", measured)
    monkeypatch.setattr(
        transcription,
        "status",
        lambda root: [{"model": "tiny.en", "installed": True, "runtime_available": True}],
    )
    with TestClient(app) as c:

        def rpc(name, arguments):
            response = c.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": name, "arguments": arguments},
                },
            )
            assert response.status_code == 200, response.text
            result = response.json()["result"]
            assert not result.get("isError"), result
            if "structuredContent" in result:
                return result["structuredContent"]
            return json.loads(next(x["text"] for x in result["content"] if x["type"] == "text"))

        project = rpc("create_project", {"name": "QA MCP production"})
        image = io.BytesIO()
        Image.new("RGB", (320, 180), "#294943").save(image, format="PNG")
        asset = rpc(
            "import_asset",
            {
                "filename": "frame.png",
                "data_base64": base64.b64encode(image.getvalue()).decode(),
                "project_id": project["id"],
            },
        )
        narration = rpc(
            "start_production_task",
            {
                "request": {
                    "request_key": "mcp-voice-test",
                    "request": {
                        "type": "prepare_narration",
                        "project_id": project["id"],
                        "lines": [{"id": "hook", "text": "Three new games to play"}],
                    },
                }
            },
        )
        narration = rpc(
            "wait_production_task", {"task_id": narration["id"], "request": {"timeout_seconds": 10}}
        )
        assert narration["status"] == "completed", narration
        request = {
            "expected_revision": 1,
            "narration_task_id": narration["id"],
            "profile": {"width": 128, "height": 228, "fps": 30},
            "beats": [
                {
                    "id": "hook",
                    "role": "hook",
                    "title": "EDITORIAL TITLE",
                    "duration_ms": 3000,
                    "shots": [{"asset_id": asset["id"]}],
                }
            ],
        }
        candidate = rpc("compose_showcase", {"project_id": project["id"], "request": request})
        assert not candidate["committed"]
        saved = rpc(
            "compose_showcase", {"project_id": project["id"], "request": {**request, "dry_run": False}}
        )
        assert saved["project"]["revision"] == 2
        caption_track = next(t for t in saved["project"]["tracks"] if t["id"] == "captions")
        assert caption_track["clips"]
        assert all(c["text_auto_center"] for c in caption_track["clips"])
        assert all(
            not c["text_auto_center"]
            for t in saved["project"]["tracks"]
            if t["id"] == "titles"
            for c in t["clips"]
        )
        assert (
            saved["project"]["script_lines"][0]["audio_asset_id"]
            == narration["result"]["narration"][0]["asset"]["id"]
        )
        render = rpc("start_render", {"project_id": project["id"], "expected_revision": 2})
        render = rpc("wait_for_render", {"job_id": render["id"], "request": {"timeout_seconds": 25}})
        assert render["status"] == "completed", render
        task = rpc(
            "start_production_task",
            {
                "request": {
                    "request_key": "mcp-verify-test",
                    "request": {"type": "verify_render", "job_id": render["id"]},
                }
            },
        )
        task = rpc("wait_production_task", {"task_id": task["id"], "request": {"timeout_seconds": 25}})
        assert task["status"] == "completed", task
        assert task["result"]["verification"]["decode_passed"]
        assert task["result"]["verification"]["browser_playback_tested"] is False
        package = rpc(
            "start_production_task",
            {
                "request": {
                    "request_key": "mcp-package-test",
                    "request": {
                        "type": "package_delivery",
                        "job_id": render["id"],
                        "verification_task_id": task["id"],
                    },
                }
            },
        )
        package = rpc("wait_production_task", {"task_id": package["id"], "request": {"timeout_seconds": 10}})
        assert package["status"] == "completed", package
        import zipfile

        with zipfile.ZipFile(
            p.store.path(package["result"]["delivery"]["bundle_url"].removeprefix("/media/"))
        ) as archive:
            assert {"final.mp4", "captions.srt", "project.json", "verification.json", "sources.json"} <= set(
                archive.namelist()
            )
            assert (
                "EDITORIAL TITLE" not in archive.read("captions.srt").decode()
            )  # branding is not in spoken captions


def test_range_delivery_captions_are_clipped_rebased_and_not_branding(env):
    from synkinema.production.engine import Production

    _, _, p = env
    p.tracks[1].id = "captions"
    p.tracks[1].clips = [
        Clip(id="a", text="before", start_ms=0, duration_ms=1000),
        Clip(id="b", text="crossing", start_ms=1000, duration_ms=2000),
        Clip(id="c", text="after", start_ms=3000, duration_ms=2000),
    ]
    srt = Production.srt(p, None, 1500, 3500)
    assert "before" not in srt
    assert "00:00:00,000 --> 00:00:01,500\ncrossing" in srt
    assert "00:00:01,500 --> 00:00:02,000\nafter" in srt


@pytest.mark.asyncio
async def test_import_partial_failure_keeps_valid_asset_and_removes_temporary_bytes(env, monkeypatch):
    _, p, project = env
    calls = 0

    async def download(source, directory, run, tick):
        nonlocal calls
        calls += 1
        if calls == 2:
            (directory / "partial.mp4").write_bytes(b"partial")
            raise ValueError("Second download failed")
        path = directory / "image.png"
        Image.new("RGB", (64, 64), "red").save(path)
        return path

    monkeypatch.setattr(remote, "import_source", download)
    await p.start()
    try:
        request = StartProduction(
            request_key="partial-import-01",
            request={
                "type": "import_media",
                "project_id": project.id,
                "sources": [
                    {"url": "https://example.com/a.png", "filename": "a.png"},
                    {"url": "https://example.com/b.mp4", "filename": "b.mp4"},
                ],
            },
        )
        task = p.enqueue(request)
        result = await p.wait(task.id, 5)
        assert result.status == "failed" and len(result.result.assets) == 1
        asset = result.result.assets[0]
        assert p.store.path(asset.path).exists()
        assert p.store.path(f"cache/{asset.id}-provenance.json").exists()
        assert not list(p.store.path("uploads").glob("production-*"))
        assert p.enqueue(request).id == task.id and calls == 2
    finally:
        await p.stop()


@pytest.mark.asyncio
async def test_steam_search_requires_real_html_response(monkeypatch):
    from synkinema.production.contracts import SteamSearch

    async def download(url, **kw):
        assert "infinite=1" in url and "json=1" not in url
        return json.dumps(
            {
                "success": 1,
                "total_count": 1,
                "results_html": '<a class="search_result_row" href="https://store.steampowered.com/app/123/Game/">'
                '<span class="title">Actual &amp; Game</span></a>',
            }
        ).encode()

    monkeypatch.setattr(remote, "download", download)
    result = await remote.search_steam(SteamSearch(count=1))
    assert result["candidates"][0]["app_id"] == 123
    assert result["candidates"][0]["name"] == "Actual & Game"

    async def changed(url, **kw):
        return b'{"items": []}'

    monkeypatch.setattr(remote, "download", changed)
    with pytest.raises(ValueError, match="unsupported response"):
        await remote.search_steam(SteamSearch())


@pytest.mark.asyncio
async def test_direct_audio_trim_real_metadata_and_malicious_playlist_rejected(env, monkeypatch, tmp_path):
    from synkinema.media import probe
    from synkinema.production.contracts import MediaSource

    _, p, _ = env

    async def tick(*a):
        pass

    async def download(url, path, **kw):
        path.write_bytes(speech_bytes())

    monkeypatch.setattr(remote, "download", download)
    output = await remote.import_source(
        MediaSource(url="https://example.com/take.wav", filename="take.wav", from_ms=500, to_ms=1000),
        tmp_path,
        p.run,
        tick,
    )
    assert probe(output)["duration_ms"] == 500

    async def malicious(url, path, **kw):
        path.write_text("#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:///etc/passwd\n#EXT-X-ENDLIST")

    monkeypatch.setattr(remote, "download", malicious)
    with pytest.raises(ValueError, match="Media processing failed"):
        await remote.import_source(MediaSource(url="https://example.com/fake.mp4"), tmp_path, p.run, tick)


@pytest.mark.asyncio
async def test_voice_install_verifies_before_replacement_and_reuses_ready_model(env, monkeypatch):
    import hashlib

    from synkinema import supertonic_tts

    _, p, _ = env
    contents = b"pinned voice-model test license"
    manifest = {
        "repo": "verified/repository",
        "revision": "a" * 40,
        "files": {"LICENSE": {"size": len(contents), "sha256": hashlib.sha256(contents).hexdigest()}},
    }
    monkeypatch.setattr(supertonic_tts, "MANIFEST", manifest)
    directory = p.voices.local.directory
    directory.mkdir(parents=True)
    (directory / "preserve").write_bytes(b"old model")
    calls = []

    async def download(url, path, **kw):
        calls.append(url)
        path.write_bytes(b"wrong checksum")

    monkeypatch.setattr(remote, "download", download)
    await p.start()
    try:
        request = StartProduction(
            request_key="install-voice-invalid", request={"type": "install_voice_model"}
        )
        task = p.enqueue(request)
        failed = await p.wait(task.id, 5)
        assert failed.status == "failed"
        assert (directory / "preserve").read_bytes() == b"old model"

        async def correct(url, path, **kw):
            calls.append(url)
            path.write_bytes(contents)

        monkeypatch.setattr(remote, "download", correct)
        task = p.enqueue(request.model_copy(update={"request_key": "install-voice-valid"}))
        complete = await p.wait(task.id, 5)
        assert complete.status == "completed" and complete.result.voice_model.configured
        assert (directory / "LICENSE").read_bytes() == contents
        count = len(calls)
        again = p.enqueue(request.model_copy(update={"request_key": "install-voice-again"}))
        assert (await p.wait(again.id, 5)).status == "completed" and len(calls) == count
        assert not list(p.store.path("uploads").glob("production-*"))
    finally:
        await p.stop()
