from mcp.server.fastmcp import Audio, Image
from mcp.types import ToolAnnotations
from pydantic import Field

from ..api_contract import CaptionPreview, RenderJob, TextLayerRequest
from ..mcp_inputs import ProductionTaskId, ProjectId, RenderJobId
from ..media import cached_text_layer, caption_bounds
from ..models import Model
from .composition import compose
from .contracts import (
    ComposeReel,
    CompositionResult,
    LayoutReport,
    LayoutRequest,
    ProductionCapabilities,
    ProductionTask,
    RevisionComparison,
    SourceInspection,
    SourcePreview,
    SourcePreviewRequest,
    SourceSheet,
    StartProduction,
    SteamGame,
    SteamGames,
    SteamSearch,
    SteamSearchResult,
    WaitRequest,
)
from .layout import caption_layout, inspect_source
from .preview import preview_source
from .reference import REST_DESCRIPTIONS as D
from .remote import search_steam, steam_game
from .transcription import status
from .usage import SourceUsageRequest, SourceUsageResult, source_usage


class RevisionCompare(Model):
    before_revision: int = Field(ge=1)
    after_revision: int = Field(ge=1)


def capabilities(production):
    return {
        "version": 1,
        "transcribers": status(production.store.root),
        "task_types": [
            "import_media",
            "import_steam_trailer",
            "import_steam_trailers",
            "install_transcriber",
            "install_voice_model",
            "transcribe",
            "prepare_narration",
            "generate_score",
            "verify_render",
            "package_delivery",
        ],
        "templates": [
            {
                "id": "showcase-v1",
                "portrait": True,
                "editable_tracks": 9,
                "voice_timing": "measured",
                "default_dry_run": True,
            },
            {
                "id": "gameplay-v1",
                "portrait": True,
                "landscape": True,
                "editable_tracks": 9,
                "voice_timing": "measured",
                "default_dry_run": True,
            },
        ],
        "limits": {
            "download_bytes": 512 * 1024**2,
            "media_interval_ms": 600_000,
            "narration_lines": 20,
            "source_frames": 24,
            "wait_seconds": 60,
            "steam_trailers_per_task": 8,
            "source_preview_ms": 15_000,
            "concurrent_production_tasks": 1,
        },
        "workflow": [
            "search_steam_games / get_steam_games",
            "start_production_task(import_steam_trailers) → wait_production_task",
            "inspect_source_frames(count=3), preview_source_media, get_source_usage for each selected cut",
            "install_transcriber if missing; prepare_narration batch → wait",
            "generate_score → wait",
            "compose_showcase(dry_run=true), review, then dry_run=false using same confirmed revision",
            "start_render → wait_for_render",
            "render_frames(job_id), verify_render task, inspect_caption_layout",
            "package_delivery with exact verification task ID",
        ],
        "limits_notes": [
            "ASR is approximate, not guaranteed forced alignment; estimated words are flagged.",
            "No external shell, arbitrary Python, authentication bypass, DRM or live HLS.",
            "Browser playback cannot be asserted by a server-side MCP tool; verification reports browser_playback_tested=false.",
            "MCP images and media URLs let an agent review without downloading files through Python.",
            "Import batches share one durable task and preserve per-trailer errors; heavy processing remains serialized to bound CPU/RAM and protect source lifetime.",
            "Source previews return real GIF/MP4 or inline WAV audio; clients may not play motion/audio. ASR is not listening.",
        ],
    }


def revision_diff(service, pid, r):
    a = service.get(pid, r.before_revision)
    b = service.get(pid, r.after_revision)

    def clips(p):
        return {c.id: (t.id, c.model_dump()) for t in p.tracks for c in t.clips}

    ac, bc = clips(a), clips(b)
    changes = []
    for id in sorted(set(ac) | set(bc)):
        if id not in ac or id not in bc:
            changes.append({"clip_id": id, "change": "added" if id in bc else "removed"})
            continue
        fields = [k for k in ac[id][1] if ac[id][1][k] != bc[id][1][k]]
        if ac[id][0] != bc[id][0]:
            fields.append("track_id")
        if fields:
            changes.append({"clip_id": id, "change": "updated", "fields": fields})

    def subset(p, kinds):
        return [t.model_dump() for t in p.tracks if t.kind in kinds]

    return {
        "project_id": pid,
        "before_revision": a.revision,
        "after_revision": b.revision,
        "clip_changes": changes,
        "track_changes": [
            id
            for id in sorted({t.id for t in a.tracks} | {t.id for t in b.tracks})
            if next((t.model_dump() for t in a.tracks if t.id == id), None)
            != next((t.model_dump() for t in b.tracks if t.id == id), None)
        ],
        "profile_unchanged": a.profile == b.profile,
        "script_unchanged": a.script == b.script,
        "audio_unchanged": subset(a, {"voiceover", "music", "sound", "ambient"})
        == subset(b, {"voiceover", "music", "sound", "ambient"}),
        "text_unchanged": subset(a, {"text"}) == subset(b, {"text"}),
    }


async def render_wait(production, id, seconds):
    import asyncio

    from .engine import TERMINAL

    deadline = asyncio.get_running_loop().time() + seconds
    while True:
        job = production.service.public_job(production.store.job(id))
        if job["status"] in TERMINAL or asyncio.get_running_loop().time() >= deadline:
            return job
        await asyncio.sleep(min(0.5, max(0, deadline - asyncio.get_running_loop().time())))


def compose_task(production, pid, r):
    task = production.get(r.narration_task_id)
    if (
        task.status != "completed"
        or task.request.type != "prepare_narration"
        or task.request.project_id != pid
    ):
        raise ValueError("A completed narration task from this project is required")
    return compose(production.service, r, pid, task.result.narration)


def register_http(app, p):
    @app.get("/api/production/capabilities", response_model=ProductionCapabilities)
    def production_capabilities():
        return capabilities(p)

    @app.post("/api/production/steam/search", response_model=SteamSearchResult)
    async def steam_search(request: SteamSearch):
        return await search_steam(request)

    @app.post("/api/production/steam/games", response_model=list[SteamGame])
    async def steam_games(request: SteamGames):
        return [(await steam_game(id))[0] for id in request.app_ids]

    @app.post("/api/production/tasks", response_model=ProductionTask, status_code=202)
    def production_start(request: StartProduction):
        return p.enqueue(request)

    @app.get("/api/production/tasks", response_model=list[ProductionTask])
    def production_list():
        return p.list()

    @app.get("/api/production/tasks/{task_id}", response_model=ProductionTask)
    def production_get(task_id: str):
        return p.get(task_id)

    @app.post("/api/production/tasks/{task_id}/wait", response_model=ProductionTask)
    async def production_wait(task_id: str, request: WaitRequest):
        return await p.wait(task_id, request.timeout_seconds)

    @app.post("/api/production/tasks/{task_id}/cancel", response_model=ProductionTask)
    def production_cancel(task_id: str):
        return p.cancel(task_id)

    @app.post("/api/production/source-frames", response_model=SourceSheet)
    async def source_frames(request: SourceInspection):
        async with p.inspection.lifecycle:
            return await inspect_source(p.service, request, p.run)

    @app.post("/api/production/caption-layout", response_model=LayoutReport, name="caption_layout")
    def caption_layout_read(request: LayoutRequest):
        return caption_layout(p.service, p.service.get(request.project_id, request.revision))

    @app.post("/api/production/source-preview", response_model=SourcePreview)
    async def source_preview(request: SourcePreviewRequest):
        async with p.inspection.lifecycle:
            return await preview_source(p.service, request, p.run)

    @app.post("/api/production/source-usage", response_model=SourceUsageResult)
    def source_usage_read(request: SourceUsageRequest):
        return source_usage(p.service, request)

    @app.post("/api/projects/{project_id}/showcase", response_model=CompositionResult)
    def showcase_compose(project_id: str, request: ComposeReel):
        return compose_task(p, project_id, request)

    @app.post("/api/jobs/{job_id}/wait", response_model=RenderJob, name="render_wait")
    async def render_wait_read(job_id: str, request: WaitRequest):
        return await render_wait(p, job_id, request.timeout_seconds)

    @app.post("/api/projects/{project_id}/compare-revisions", response_model=RevisionComparison)
    def revision_compare(project_id: str, request: RevisionCompare):
        return revision_diff(p.service, project_id, request)


def register_mcp(mcp, p):
    read = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
    cache = ToolAnnotations(
        readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False
    )
    network = ToolAnnotations(
        readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=True
    )

    def tool(name, description, annotations):
        return mcp.tool(name=name, description=description, annotations=annotations)

    @tool("get_production_capabilities", D["production_capabilities"], read)
    def discovery() -> ProductionCapabilities:
        return ProductionCapabilities.model_validate(capabilities(p))

    @tool("search_steam_games", D["steam_search"], network)
    async def search(request: SteamSearch) -> SteamSearchResult:
        return SteamSearchResult.model_validate(await search_steam(request))

    @tool("get_steam_games", D["steam_games"], network)
    async def games(request: SteamGames) -> list[SteamGame]:
        return [(await steam_game(id))[0] for id in request.app_ids]

    @tool(
        "start_production_task",
        D["production_start"],
        ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=True),
    )
    def start(request: StartProduction) -> ProductionTask:
        return p.enqueue(request)

    @tool("list_production_tasks", D["production_list"], read)
    def tasks() -> list[ProductionTask]:
        return p.list()

    @tool("get_production_task", D["production_get"], read)
    def get(task_id: ProductionTaskId) -> ProductionTask:
        return p.get(task_id)

    @tool("wait_production_task", D["production_wait"], read)
    async def wait(task_id: ProductionTaskId, request: WaitRequest) -> ProductionTask:
        return await p.wait(task_id, request.timeout_seconds)

    @tool("cancel_production_task", D["production_cancel"], cache)
    def cancel(task_id: ProductionTaskId) -> ProductionTask:
        return p.cancel(task_id)

    @tool("inspect_source_frames", D["source_frames"], cache)
    async def source(request: SourceInspection) -> list:
        async with p.inspection.lifecycle:
            result = await inspect_source(p.service, request, p.run)
        return [result.model_dump(), Image(path=str(p.store.path(result.url.removeprefix("/media/"))))]

    @tool("inspect_caption_layout", D["caption_layout"], cache)
    def layout(request: LayoutRequest) -> LayoutReport:
        return caption_layout(p.service, p.service.get(request.project_id, request.revision))

    @tool("preview_source_media", D["source_preview"], cache)
    async def source_preview(request: SourcePreviewRequest) -> list:
        async with p.inspection.lifecycle:
            result = await preview_source(p.service, request, p.run)
            path = str(p.store.path(result.url.removeprefix("/media/")))
            content = [result.model_dump()]
            if request.format == "wav":
                content.append(Audio(path=path))
            elif request.format == "gif":
                content.append(Image(path=path))
            return content

    @tool("get_source_usage", D["source_usage_read"], read)
    def usage(request: SourceUsageRequest) -> SourceUsageResult:
        return source_usage(p.service, request)

    @tool(
        "preview_caption",
        "Measure and view one proposed text clip using the same rasterizer as the final export. request={clip,profile}; accepts unsaved text. Returns actual image URL and clipped foreground bounds plus ImageContent. No project edits or render job; use inspect_caption_layout for collisions across the complete timeline.",
        cache,
    )
    def preview(request: TextLayerRequest) -> list:
        path = cached_text_layer(
            request.clip, request.profile.width, request.profile.height, p.store.path("cache")
        )
        result = CaptionPreview(
            url=f"/media/cache/{path.name}",
            width=request.profile.width,
            height=request.profile.height,
            bounds=caption_bounds(path),
        )
        return [result.model_dump(), Image(path=str(path))]

    @tool(
        "compose_showcase",
        D["showcase_compose"],
        ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False),
    )
    def showcase(project_id: ProjectId, request: ComposeReel) -> CompositionResult:
        return compose_task(p, project_id, request)

    @tool("wait_for_render", D["render_wait"], read)
    async def wait_render(job_id: RenderJobId, request: WaitRequest) -> dict:
        return await render_wait(p, job_id, request.timeout_seconds)

    @tool("compare_project_revisions", D["revision_compare"], read)
    def compare(project_id: ProjectId, request: RevisionCompare) -> RevisionComparison:
        return RevisionComparison.model_validate(revision_diff(p.service, project_id, request))
