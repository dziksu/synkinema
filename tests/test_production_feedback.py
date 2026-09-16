"""Agent feedback: discovery, batch recovery, real previews and source reuse."""

import asyncio
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from synkinema.agent_reference import agent_guide, guide_page
from synkinema.channels import ChannelInput, ChannelUpdate, PublicationWrite
from synkinema.models import Clip, Operation, Project, Track
from synkinema.production import remote
from synkinema.production.contracts import (
    ComposeReel,
    SourcePreviewRequest,
    StartProduction,
    SteamSearch,
    SteamTrailerSelection,
)
from synkinema.production.preview import preview_source
from synkinema.production.routes import compose_task
from synkinema.production.usage import SourceUsageRequest, source_usage
from synkinema.service import Conflict
from test_production import env as production_env
from test_production import install_measured_take

env = production_env


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "sort,soon,expected",
    [
        ("most_wishlisted", True, "popularwishlist"),
        ("popular", False, "topsellers"),
        ("release_date", True, "comingsoon"),
        ("relevance", False, None),
    ],
)
async def test_steam_filters_preserve_observed_order_and_evidence(monkeypatch, sort, soon, expected):
    async def download(url, **kw):
        params = parse_qs(urlsplit(url).query)
        assert params.get("filter", [None])[0] == expected
        assert params["tags"] == ["1695"]
        assert params.get("sort_by", [""])[0] == ("Released_DESC" if sort == "release_date" else "")
        return json.dumps(
            {
                "success": 1,
                "total_count": 100,
                "results_html": "".join(
                    f'<a class="search_result_row" href="https://store.steampowered.com/app/{i}/"><span class="title">Game {i}</span></a>'
                    for i in [999, 123]
                ),
            }
        ).encode()

    monkeypatch.setattr(remote, "download", download)
    result = await remote.search_steam(
        SteamSearch(sort=sort, coming_soon=soon, tag_ids=[1695], start=20, count=2)
    )
    assert [x["app_id"] for x in result["candidates"]] == [999, 123]
    assert result["next_start"] == 22 and "tags=1695" in result["source"]
    assert result["sort"] == sort and result["coming_soon"] == soon
    with pytest.raises(ValueError):
        SteamSearch(sort="popular", coming_soon=True)


@pytest.mark.asyncio
async def test_batch_steam_partial_failure_fallback_and_provenance(env, monkeypatch):
    _, p, project = env
    metadata_calls = []

    async def download(url, **kw):
        metadata_calls.append(url)
        return json.dumps(
            {
                "123": {
                    "success": True,
                    "data": {
                        "name": "QA Game",
                        "movies": [
                            {
                                "id": 1,
                                "name": "One",
                                "mp4": {"480": "https://example.com/bad.mp4"},
                                "hls_h264": "https://example.com/good.m3u8",
                            },
                            {"id": 2, "name": "Unavailable"},
                            {"id": 3, "name": "Three", "webm": {"max": "https://example.com/third.webm"}},
                        ],
                    },
                }
            }
        ).encode()

    calls = []

    async def import_source(source, directory, run, tick):
        calls.append(source.url)
        if "bad" in source.url:
            raise ValueError("unsupported encoding")
        path = directory / "frame.png"
        Image.new("RGB", (64, 64), "red" if "good" in source.url else "blue").save(path)
        return path

    monkeypatch.setattr(remote, "download", download)
    monkeypatch.setattr(remote, "import_source", import_source)
    with pytest.raises(ValueError):
        SteamTrailerSelection(app_id=123, movie_id=1, from_ms=5000, to_ms=4000)
    await p.start()
    try:
        request = StartProduction(
            request_key="batch-steam-test",
            request={
                "type": "import_steam_trailers",
                "project_id": project.id,
                "trailers": [
                    {"app_id": 123, "movie_id": i, "from_ms": 1000, "to_ms": 3000} for i in (1, 2, 3)
                ],
            },
        )
        task = p.enqueue(request)
        result = await p.wait(task.id, 10)
        assert result.status == "failed" and len(result.result.assets) == 2
        error = result.result.import_errors[0]
        assert error.index == 1 and error.movie_id == 2 and "fresh metadata" in error.error
        assert len(metadata_calls) == 1 and len(calls) == 3
        assert p.enqueue(request).id == task.id
        with pytest.raises(Conflict):
            p.enqueue(
                request.model_copy(
                    update={
                        "request": request.request.model_copy(
                            update={"trailers": request.request.trailers[:1]}
                        )
                    }
                )
            )
        for asset, movie in zip(result.result.assets, (1, 3), strict=True):
            provenance = json.loads(p.store.path(f"cache/{asset.id}-provenance.json").read_text())[-1]
            assert provenance["steam"]["movie_id"] == movie
            assert provenance["request"]["from_ms"] == 1000
            assert p.store.path(asset.path).exists()
        assert not list(p.store.path("uploads").glob("production-*"))
    finally:
        await p.stop()


async def video_asset(p, project, tmp_path):
    path = tmp_path / "moving.mp4"
    await p.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=160x90:rate=24:duration=3",
            "-f",
            "lavfi",
            "-i",
            "sine=duration=3",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-threads",
            "2",
            "-y",
            str(path),
        ]
    )
    return p.service.import_file(path, project_id=project.id)


@pytest.mark.asyncio
async def test_steam_batch_cancel_preserves_first_and_never_starts_third(env, monkeypatch):
    _, p, project = env
    started = asyncio.Event()
    calls = []
    from synkinema.production.contracts import MediaSource, SteamGame

    async def game(app_id):
        return SteamGame(
            app_id=app_id,
            name="QA",
            url="https://example.com",
            fetched_at="now",
            metadata_sha256="a",
            release_date="",
            coming_soon=True,
            description="",
            developers=[],
            publishers=[],
            categories=[],
            genres=[],
            movies=[],
        ), b"{}"

    def sources(game, selection):
        return [MediaSource(url=f"https://example.com/{selection.movie_id}.mp4")]

    async def download(source, directory, run, tick):
        calls.append(source.url)
        if len(calls) == 2:
            started.set()
            while True:
                await tick()
        path = directory / "first.png"
        Image.new("RGB", (64, 64), "red").save(path)
        return path

    monkeypatch.setattr(remote, "steam_game", game)
    monkeypatch.setattr(remote, "trailer_sources", sources)
    monkeypatch.setattr(remote, "import_source", download)
    await p.start()
    try:
        task = p.enqueue(
            StartProduction(
                request_key="cancel-batch-test",
                request={
                    "type": "import_steam_trailers",
                    "project_id": project.id,
                    "trailers": [{"app_id": 123, "movie_id": n} for n in (1, 2, 3)],
                },
            )
        )
        await asyncio.wait_for(started.wait(), 5)
        p.cancel(task.id)
        stopped = await p.wait(task.id, 5)
        assert stopped.status == "cancelled" and len(stopped.result.assets) == 1
        assert not stopped.result.import_errors and len(calls) == 2
        assert not list(p.store.path("uploads").glob("production-*"))
    finally:
        await p.stop()


@pytest.mark.asyncio
async def test_real_motion_audio_preview_cache_bounds_and_cleanup(env, tmp_path):
    app, p, project = env
    asset = await video_asset(p, project, tmp_path)
    request = SourcePreviewRequest(asset_id=asset["id"], from_ms=500, to_ms=1500)
    preview = await preview_source(p.service, request, p.run)
    assert preview.has_audio and abs(preview.duration_ms - 1000) < 100

    async def no_encode(*args, **kw):
        pytest.fail("Cached preview must not encode twice")

    assert await preview_source(p.service, request, no_encode) == preview
    silent = await preview_source(p.service, request.model_copy(update={"include_audio": False}), p.run)
    assert not silent.has_audio and silent.url != preview.url
    gif = await preview_source(p.service, request.model_copy(update={"format": "gif"}), p.run)
    with Image.open(p.store.path(gif.url.removeprefix("/media/"))) as image:
        assert image.is_animated and image.n_frames >= 9
    assert not gif.has_audio

    async def failed_encode(args, **kw):
        Path(args[-1]).write_bytes(b"partial")
        raise ValueError("encoder failed")

    with pytest.raises(ValueError, match="encoder failed"):
        await preview_source(p.service, request.model_copy(update={"from_ms": 600}), failed_encode)
    assert not list(p.store.path("cache").glob("source-preview-*"))
    with pytest.raises(ValueError):
        await preview_source(p.service, request.model_copy(update={"to_ms": 4000}), p.run)
    with pytest.raises(ValueError):
        SourcePreviewRequest(asset_id=asset["id"], to_ms=15001)
    with TestClient(app) as client:
        result = client.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "preview_source_media",
                    "arguments": {"request": {**request.model_dump(), "format": "wav"}},
                },
            },
        ).json()["result"]
        assert not result.get("isError"), result
        assert any(x["type"] == "audio" and x["mimeType"] == "audio/wav" for x in result["content"])
        assert client.get(preview.url, headers={"Range": "bytes=0-99"}).status_code == 206
        deleted = client.request("DELETE", f"/api/projects/{project.id}", json={"expected_revision": 1})
        assert deleted.status_code == 200, deleted.text
    assert not p.store.path(preview.url.removeprefix("/media/")).exists()
    assert not list(p.store.path("cache").glob("source-preview-*"))


def test_gameplay_composition_uneven_shots_optional_hook_limit_and_footer(env, tmp_path):
    _, p, project = env
    task, visual = install_measured_take(p, project, tmp_path)
    take = p.get(task.id)
    # A valid take's duration governs fit; the recognized hook limit is explicitly optional.
    take.result.narration[0].transcript.speech_end_ms = 4000
    request = ComposeReel(
        expected_revision=1,
        narration_task_id=task.id,
        template="gameplay-v1",
        series_title="",
        show_titles=False,
        beats=[
            {
                "id": "one",
                "title": "QA",
                "role": "hook",
                "duration_ms": 3000,
                "shots": [
                    {"asset_id": visual["id"], "duration_ms": 1000},
                    {"asset_id": visual["id"], "duration_ms": 2000},
                ],
            }
        ],
    )
    from synkinema.production.composition import compose

    result = compose(p.service, request, project.id, take.result.narration)
    video = next(t for t in result.project.tracks if t.id == "atmosphere")
    assert [c.duration_ms for c in video.clips] == [1000, 2000]
    assert all(c.transform.opacity == 1 for c in video.clips)
    assert not next(t for t in result.project.tracks if t.id == "titles").clips
    assert not next(t for t in result.project.tracks if t.id == "disclosure").clips
    with pytest.raises(ValueError, match="requested 3000"):
        compose(
            p.service, request.model_copy(update={"hook_max_ms": 3000}), project.id, take.result.narration
        )
    request.beats[0].shots[1].duration_ms = None
    with pytest.raises(ValueError, match="every shot"):
        compose_task(p, project.id, request)
    assert p.service.get(project.id).revision == 1


@pytest.mark.asyncio
async def test_source_usage_original_offsets_speed_layers_and_publication_survival(env, tmp_path):
    app, p, _ = env
    channel = p.service.create_channel(ChannelInput(name="Single game", rules="One game per film"))
    project = p.service.create(Project(name="Usage QA", channel_id=channel.id))
    asset = await video_asset(p, project, tmp_path)
    record = {
        "request": {"url": "https://example.com/a.mp4", "from_ms": 10000},
        "steam": {"movie_id": 7, "game": {"app_id": 123}},
    }
    p.store.path(f"cache/{asset['id']}-provenance.json").write_text(json.dumps([record]))
    clip = Clip(asset_id=asset["id"], source_in_ms=500, duration_ms=1000, speed=2)
    updated = p.service.apply(
        project.id,
        Operation(
            expected_revision=1,
            type="add_clip",
            payload={"track_id": project.tracks[0].id, "clip": clip.model_dump()},
        ),
    )
    updated = p.service.apply(
        project.id,
        Operation(
            expected_revision=2,
            type="add_track",
            payload=Track(
                id="copy",
                name="Simultaneous copy",
                kind="overlay",
                clips=[clip.model_copy(update={"id": "second-layer"})],
            ).model_dump(),
        ),
    )
    found = source_usage(p.service, SourceUsageRequest(channel_id=channel.id, app_id=123))
    assert found.total_count == 1 and len(found.uses[0].clip_ids) == 2
    assert (found.uses[0].from_ms, found.uses[0].to_ms) == (10500, 12500)
    assert (
        source_usage(p.service, SourceUsageRequest(asset_id=asset["id"], from_ms=0, to_ms=500)).total_count
        == 0
    )
    assert (
        source_usage(
            p.service, SourceUsageRequest(asset_id=asset["id"], from_ms=1000, to_ms=2000)
        ).total_count
        == 1
    )
    # A different file/asset imported from another trailer offset still overlaps
    # in original source time; checksum-only matching would miss this.
    alternate_path = tmp_path / "alternate.mp4"
    await p.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(p.store.path(asset["path"])),
            "-vf",
            "scale=128:72",
            "-an",
            "-threads",
            "2",
            "-y",
            str(alternate_path),
        ]
    )
    alternate = p.service.import_file(alternate_path, project_id=project.id)
    assert alternate["id"] != asset["id"]
    p.store.path(f"cache/{alternate['id']}-provenance.json").write_text(
        json.dumps(
            [{**record, "request": {"url": "https://example.com/another-encoding.mp4", "from_ms": 12000}}]
        )
    )
    cross = source_usage(p.service, SourceUsageRequest(asset_id=alternate["id"], from_ms=0, to_ms=500))
    assert cross.total_count == 1 and cross.uses[0].asset_id == asset["id"]
    publication = PublicationWrite(
        expected_version=1,
        project_id=project.id,
        project_revision=3,
        title="Published",
        platform="youtube",
        url="https://youtube.com/watch?v=qa",
    )
    detail = p.service.record_publication(channel.id, publication)
    published = detail.publications[0]
    assert published.source_usage[0].from_ms == 10500
    # Stale channel writes cannot change the ledger.
    with pytest.raises(Conflict):
        p.service.record_publication(channel.id, publication)
    with TestClient(app) as client:
        response = client.request(
            "DELETE", f"/api/projects/{project.id}", json={"expected_revision": updated.revision}
        )
        assert response.status_code == 200, response.text
    found = source_usage(p.service, SourceUsageRequest(channel_id=channel.id, app_id=123))
    assert found.total_count == 1 and found.uses[0].publication_id == published.id
    detail = p.service.record_publication(
        channel.id,
        publication.model_copy(
            update={
                "expected_version": 2,
                "publication_id": published.id,
                "project_revision": None,
                "title": "Corrected title",
            }
        ),
    )
    assert detail.publications[0].source_usage == published.source_usage
    assert detail.publications[0].project_revision == 3


def test_compact_guide_pages_are_lossless():
    overview = guide_page()
    assert len(json.dumps(overview)) < 6500
    for section in overview["sections"]:
        offset, pieces = 0, []
        while True:
            page = guide_page(section["id"], offset, 500)
            assert len(page["text"]) <= 500
            pieces.append(page["text"])
            if page["next_offset"] is None:
                break
            offset = page["next_offset"]
        assert len("".join(pieces)) == section["characters"]
        assert "".join(pieces) in agent_guide()
    with pytest.raises(ValueError):
        guide_page("missing")


def test_mcp_compact_context_refreshes_changed_channel_rules(env):
    app, p, _ = env
    channel = p.service.create_channel(ChannelInput(name="QA", rules="One game only. " * 500))
    with TestClient(app) as client:

        def call(tool_name, **arguments):
            r = client.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": tool_name, "arguments": arguments},
                },
            ).json()["result"]
            assert not r.get("isError"), r
            return r.get("structuredContent") or json.loads(r["content"][0]["text"])

        inventory = call("list_channels")
        assert "rules" not in inventory["channels"][0]
        assert call("get_channel", channel_id=channel.id)["channel"]["rules"] == channel.rules
        assert call("get_channel", channel_id=channel.id, known_version=1)["unchanged"]
        created = call("create_project", name="Context QA", channel_id=channel.id, known_channel_version=1)
        assert created["channel_context"]["unchanged"]
        p.service.update_channel(
            channel.id,
            ChannelUpdate(
                **{
                    **channel.model_dump(exclude={"id", "version", "created_at", "updated_at"}),
                    "rules": "Changed",
                    "expected_version": 1,
                }
            ),
        )
        fresh = call("get_project", project_id=created["id"], known_channel_version=1)
        assert fresh["channel_context"]["channel"]["rules"] == "Changed"
        assert call("get_agent_guide")["sections"]
