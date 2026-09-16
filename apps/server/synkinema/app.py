import asyncio
import contextlib
import json
import os
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html, get_swagger_ui_oauth2_redirect_html
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import __version__
from . import api_contract as contract
from .agent_reference import REST_DESCRIPTIONS, agent_guide, operation_reference
from .deletion import Deletion
from .exporting import ExportCatalog, ExportPlan, export_catalog
from .inspection import Inspection
from .mcp_server import make_mcp
from .media import cached_text_layer, caption_bounds
from .models import (
    AssetLocation,
    BatchRequest,
    CloneRequest,
    FolderRename,
    FolderRequest,
    Model,
    Operation,
    Project,
    RenderRequest,
    uid,
)
from .renderer import CAPABILITIES
from .service import Conflict, Service
from .storage import Store
from .voices import VoiceRequest, Voices
from .worker import Worker


class FrameRequest(Model):
    time_ms: int = 0
    revision: int | None = None
    job_id: str | None = None


class SheetRequest(Model):
    timestamps_ms: list[int] | None = None
    revision: int | None = None
    job_id: str | None = None


class AudioRequest(Model):
    revision: int | None = None
    job_id: str | None = None


class CommentRequest(Model):
    revision: int
    time_ms: int
    message: str


def create_app(data_dir=None, start_worker=True):
    store = Store(data_dir)
    service = Service(store)
    worker = Worker(service)
    inspection = Inspection(service)
    worker.cleanup_lock = inspection.lifecycle
    deletion = Deletion(service, worker, inspection)
    voices = Voices(service)
    from .production.engine import Production
    from .production.routes import register_http

    production = Production(service, inspection, voices)
    mcp = make_mcp(service, worker, inspection, voices, production)

    @contextlib.asynccontextmanager
    async def lifespan(app):
        async with mcp.session_manager.run():
            if start_worker:
                await worker.start()
                await production.start()
            yield
            await production.stop()
            await worker.stop()
            store.engine.dispose()

    app = FastAPI(
        title="Synkinema",
        description="Local FFmpeg editing API shared with MCP at /mcp/. Start with /api/agent/guide, /api/schema/project and /api/schema/operations. All timeline times are integer milliseconds. Serialize project writes using expected_revision; inspect actual renders before declaring completion.",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
        responses={
            code: {"model": contract.ApiError, "description": description}
            for code, description in {
                401: "Bearer token required when server authentication is enabled",
                403: "Cross-origin mutation refused",
                404: "Resource or pinned revision does not exist",
                409: "Stale expected_revision: reread and reconcile; never retry a write blindly",
                413: "Upload exceeds 2 GiB",
                422: "Invalid request or timeline; project writes roll back atomically",
            }.items()
        },
    )
    app.state.service, app.state.worker, app.state.inspection = service, worker, inspection
    app.state.production = production

    async def swagger_docs(request: Request):
        root = request.scope.get("root_path", "").rstrip("/")
        return get_swagger_ui_html(
            openapi_url=f"{root}{app.openapi_url}",
            title="Synkinema — API documentation",
            swagger_favicon_url=f"{root}/brand/logo-32.png",
            oauth2_redirect_url=f"{root}/docs/oauth2-redirect",
            init_oauth=app.swagger_ui_init_oauth,
            swagger_ui_parameters=app.swagger_ui_parameters,
        )

    async def swagger_redirect(request: Request):
        return get_swagger_ui_oauth2_redirect_html()

    async def redoc_docs(request: Request):
        root = request.scope.get("root_path", "").rstrip("/")
        return get_redoc_html(
            openapi_url=f"{root}{app.openapi_url}",
            title="Synkinema — API reference",
            redoc_favicon_url=f"{root}/brand/logo-32.png",
        )

    # Presentation pages use plain routes, just like FastAPI's built-in docs.
    # They are not agent API commands or part of the generated JSON contract.
    app.add_route("/api/docs", swagger_docs, include_in_schema=False)
    app.add_route("/docs/oauth2-redirect", swagger_redirect, include_in_schema=False)
    app.add_route("/redoc", redoc_docs, include_in_schema=False)

    local_hosts = ["localhost", "127.0.0.1", "[::1]", "testserver"]
    lan_hosts = [
        host.strip() for host in os.environ.get("SYNKINEMA_ALLOWED_HOSTS", "").split(",") if host.strip()
    ]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=local_hosts + lan_hosts)

    @app.middleware("http")
    async def local_security(request: Request, call_next):
        # Refuse cross-origin mutations even when a hostile page can reach localhost.
        origin = request.headers.get("origin")
        if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
            from urllib.parse import urlparse

            parsed = urlparse(origin)
            if parsed.hostname not in ("localhost", "127.0.0.1", "::1") and not (
                parsed.hostname in lan_hosts and parsed.netloc == request.url.netloc
            ):
                return JSONResponse({"detail": "Cross-origin writes are not allowed"}, status_code=403)
        token = os.environ.get("SYNKINEMA_API_TOKEN")
        if token and request.url.path.startswith(("/api/", "/mcp")) and request.url.path != "/api/health":
            import secrets

            if not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
                return JSONResponse({"detail": "Bearer token required"}, status_code=401)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(Conflict)
    async def conflict_handler(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(KeyError)
    async def missing_handler(request, exc):
        return JSONResponse({"detail": str(exc).strip("'")}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid_handler(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.get("/api/health", response_model=contract.Health)
    def health():
        return {
            "status": "ok",
            "version": __version__,
            "ffmpeg": bool(shutil.which("ffmpeg")),
            "ffprobe": bool(shutil.which("ffprobe")),
        }

    @app.get("/api/capabilities", response_model=contract.Capabilities)
    def capabilities():
        return CAPABILITIES

    @app.get("/api/agent/guide", response_class=PlainTextResponse)
    def read_agent_guide():
        return PlainTextResponse(agent_guide(), media_type="text/markdown")

    @app.get("/api/schema/project")
    def project_schema():
        return Project.model_json_schema()

    @app.get("/api/schema/operations")
    def operation_schema(operation: str | None = None):
        return operation_reference(operation)

    @app.get("/api/projects", response_model=list[contract.ProjectSnapshot])
    def projects():
        return service.projects()

    @app.post("/api/projects", status_code=201, response_model=contract.ProjectSnapshot)
    def create(project: Project):
        return service.summary(service.create(project))

    @app.get("/api/projects/{project_id}", response_model=contract.ProjectSnapshot)
    def project(project_id: str, revision: int | None = None):
        return service.summary(service.get(project_id, revision))

    @app.get(
        "/api/projects/{project_id}/clips/{clip_id}/text-layer",
        response_class=FileResponse,
        responses={
            200: {"content": {"image/png": {"schema": {"type": "string", "format": "binary"}}}},
            404: {"model": contract.ApiError, "description": "Unknown project, revision or text clip"},
        },
    )
    def caption_layer(project_id: str, clip_id: str, revision: int | None = None):
        """Transparent PNG at project resolution, using the same text layout as final exports.

        Pin revision for a stable image. Includes typography, wrapping and the contrast
        background, but not time-dependent opacity/fades (the preview applies these).
        Does not edit the project or start a video render.
        """
        project = service.get(project_id, revision)
        clip = next(
            (
                clip
                for track in project.tracks
                for clip in track.clips
                if clip.id == clip_id and (track.kind == "text" or clip.shape)
            ),
            None,
        )
        if clip is None:
            raise KeyError("Text clip not found")
        path = cached_text_layer(clip, project.profile.width, project.profile.height, store.path("cache"))
        return FileResponse(
            path,
            media_type="image/png",
            headers={
                "X-Project-Revision": str(project.revision),
                "Cache-Control": "private, max-age=31536000, immutable"
                if revision is not None
                else "no-cache",
            },
        )

    @app.post("/api/projects/{project_id}/operations", response_model=contract.ProjectSnapshot)
    def operation(project_id: str, operation: Operation):
        return service.summary(service.apply(project_id, operation))

    @app.post("/api/projects/{project_id}/operations/batch", response_model=contract.BatchResult)
    def batch(project_id: str, request: BatchRequest):
        return service.batch(project_id, request)

    @app.post("/api/projects/{project_id}/clone", status_code=201, response_model=contract.ProjectSnapshot)
    def clone(project_id: str, request: CloneRequest):
        return service.summary(service.clone(project_id, request.name, request.revision))

    @app.get("/api/projects/{project_id}/preflight", response_model=contract.Preflight)
    def preflight(project_id: str, revision: int | None = None):
        return service.preflight(project_id, revision)

    @app.get("/api/projects/{project_id}/history", response_model=list[contract.Revision])
    def history(project_id: str):
        return service.history(project_id)

    @app.get("/api/voices/status", response_model=contract.VoiceStatus)
    def voice_status():
        return voices.status()

    @app.post("/api/voices/generate", response_model=contract.VoiceResult)
    async def generate_voice(request: VoiceRequest):
        return await voices.generate(request)

    @app.get("/api/media", response_model=list[contract.Asset])
    def asset_inventory():
        return service.asset_inventory()

    @app.get("/api/assets/{asset_id}/usage", response_model=contract.AssetUsage)
    def asset_usage(asset_id: str):
        return service.asset_usage(asset_id)

    @app.put("/api/assets/{asset_id}/metadata", response_model=contract.Asset)
    def update_asset(asset_id: str, request: contract.AssetMetadataUpdate):
        return service.update_asset(asset_id, request)

    @app.delete("/api/assets/{asset_id}/location", response_model=contract.Asset)
    def remove_asset_location(asset_id: str, request: contract.RemoveAssetLocation):
        return service.remove_asset_location(asset_id, request)

    @app.post("/api/assets/batch", response_model=list[contract.Asset])
    def batch_assets(request: contract.AssetBatchUpdate):
        return service.batch_assets(request)

    @app.post("/api/assets/delete", response_model=contract.DeletionResult)
    async def delete_assets(request: contract.DeleteAssetsRequest):
        return await deletion.assets(request)

    @app.delete(
        "/api/projects/{project_id}/script-lines/{line_id}/audio",
        response_model=contract.RemoveScriptAudioResult,
    )
    async def remove_script_audio(project_id: str, line_id: str, request: contract.RemoveScriptAudioRequest):
        return await deletion.script_audio(project_id, line_id, request)

    @app.delete("/api/asset-folders/{folder_id}", response_model=contract.FolderDeletion)
    def delete_asset_folder(folder_id: str):
        return service.delete_folder(folder_id)

    @app.get("/api/assets", response_model=list[contract.Asset])
    def assets(
        q: str = "", kind: str | None = None, project_id: str | None = None, folder_id: str | None = None
    ):
        return service.assets(q, kind, project_id, folder_id)

    @app.post("/api/assets", status_code=201, response_model=contract.Asset)
    async def upload(
        file: Annotated[UploadFile, File()],
        tags: str = Form("[]"),
        source: str = Form(""),
        license: str = Form(""),
        project_id: str | None = Form(None),
        folder_id: str | None = Form(None),
    ):
        try:
            labels = json.loads(tags)
            if (
                not isinstance(labels, list)
                or len(labels) > 50
                or any(not isinstance(t, str) or len(t) > 100 for t in labels)
            ):
                raise ValueError("Tags must be an array of at most 50 strings")
        except json.JSONDecodeError:
            raise HTTPException(422, "Invalid tags JSON")
        suffix = Path(file.filename or "asset").suffix.lower()
        temporary = store.path(f"uploads/{uid()}{suffix}")
        size = 0
        try:
            with temporary.open("wb") as target:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > 2 * 1024**3:
                        raise HTTPException(413, "Maximum upload size is 2 GiB")
                    target.write(chunk)
            return await asyncio.to_thread(
                service.import_file, temporary, file.filename, labels, source, license, project_id, folder_id
            )
        finally:
            temporary.unlink(missing_ok=True)
            await file.close()

    @app.get("/api/asset-folders", response_model=list[contract.AssetFolder])
    def asset_folders(project_id: str | None = None):
        return service.folders(project_id)

    @app.post("/api/asset-folders", status_code=201, response_model=contract.AssetFolder)
    def create_asset_folder(request: FolderRequest):
        return service.create_folder(request.name, request.project_id)

    @app.patch("/api/asset-folders/{folder_id}", response_model=contract.AssetFolder)
    def rename_asset_folder(folder_id: str, request: FolderRename):
        return service.rename_folder(folder_id, request.name)

    @app.put("/api/assets/{asset_id}/location", response_model=contract.Asset)
    def locate_asset(asset_id: str, request: AssetLocation):
        return service.locate_asset(asset_id, request.project_id, request.folder_id)

    @app.get("/api/assets/{asset_id}", response_model=contract.Asset)
    def asset(asset_id: str):
        return service.asset(asset_id)

    @app.put("/api/assets/{asset_id}/tags", response_model=contract.Asset)
    def tags(asset_id: str, tags: list[str]):
        return service.tag_asset(asset_id, tags)

    @app.get("/api/export-presets", response_model=ExportCatalog)
    def export_presets():
        return export_catalog()

    @app.post("/api/projects/{project_id}/export-plan", response_model=ExportPlan)
    def plan_export(project_id: str, request: RenderRequest):
        return service.plan_export(project_id, request)

    @app.post("/api/projects/{project_id}/renders", status_code=202, response_model=contract.RenderJob)
    def render(project_id: str, request: RenderRequest):
        return service.enqueue(project_id, request)

    @app.get("/api/jobs", response_model=list[contract.RenderJob])
    def jobs(project_id: str | None = None):
        return service.jobs(project_id)

    @app.get("/api/jobs/{job_id}", response_model=contract.RenderJob)
    def job(job_id: str):
        return service.public_job(store.job(job_id))

    @app.post("/api/jobs/{job_id}/cancel", response_model=contract.RenderJob)
    async def cancel(job_id: str):
        return await worker.cancel(job_id)

    @app.delete("/api/jobs/{job_id}", response_model=contract.DeletionResult)
    async def delete_job(job_id: str):
        return await deletion.jobs(contract.DeleteJobsRequest(job_ids=[job_id]))

    @app.post("/api/jobs/clear", response_model=contract.DeletionResult)
    async def clear_jobs(request: contract.DeleteJobsRequest):
        return await deletion.jobs(request)

    @app.delete("/api/projects/{project_id}", response_model=contract.DeletionResult)
    async def delete_project(project_id: str, request: contract.DeleteProjectRequest):
        return await deletion.project(project_id, request.expected_revision)

    @app.get("/api/storage/cleanup", response_model=contract.CleanupResult)
    def cleanup_status():
        return {
            "deleted_files": 0,
            "freed_bytes": 0,
            "pending_files": len(store.rows("SELECT path FROM file_cleanup")),
        }

    @app.post("/api/storage/cleanup", response_model=contract.CleanupResult)
    async def retry_cleanup():
        async with inspection.lifecycle:
            return store.cleanup_files()

    @app.get("/api/state", response_model=contract.StateSnapshot)
    def state_snapshot():
        return {
            "projects": store.rows("SELECT id,revision FROM projects ORDER BY updated_at DESC"),
            "jobs": service.jobs(),
        }

    @app.post(
        "/api/preview/text-layer",
        response_class=FileResponse,
        responses={200: {"content": {"image/png": {"schema": {"type": "string", "format": "binary"}}}}},
    )
    def preview_text_layer(request: contract.TextLayerRequest):
        path = cached_text_layer(
            request.clip, request.profile.width, request.profile.height, store.path("cache")
        )
        return FileResponse(path, media_type="image/png")

    @app.post("/api/preview/caption", response_model=contract.CaptionPreview)
    def preview_caption(request: contract.TextLayerRequest):
        path = cached_text_layer(
            request.clip, request.profile.width, request.profile.height, store.path("cache")
        )
        return {
            "url": f"/media/{path.relative_to(store.root)}",
            "width": request.profile.width,
            "height": request.profile.height,
            "bounds": caption_bounds(path),
        }

    @app.get(
        "/api/events",
        response_class=StreamingResponse,
        responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}},
    )
    async def events(request: Request):
        async def generate():
            previous = ""
            while not await request.is_disconnected():
                payload = json.dumps(
                    {
                        "projects": [{"id": p["id"], "revision": p["revision"]} for p in service.projects()],
                        "jobs": service.jobs(),
                    }
                )
                if payload != previous:
                    yield f"data: {payload}\n\n"
                    previous = payload
                else:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(1)

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.post("/api/projects/{project_id}/inspection/frame", response_model=contract.InspectionFrame)
    async def frame(project_id: str, request: FrameRequest):
        return await inspection.frame(project_id, request.time_ms, request.revision, request.job_id)

    @app.post("/api/projects/{project_id}/inspection/sheet", response_model=contract.InspectionSheet)
    async def sheet(project_id: str, request: SheetRequest):
        return await inspection.sheet(project_id, request.timestamps_ms, request.revision, request.job_id)

    @app.post("/api/projects/{project_id}/inspection/audio", response_model=contract.AudioReport)
    async def audio(project_id: str, request: AudioRequest):
        return await inspection.audio(project_id, request.revision, request.job_id)

    @app.get("/api/projects/{project_id}/inspection/points", response_model=contract.InspectionPoints)
    def points(project_id: str, revision: int | None = None):
        return inspection.points(project_id, revision)

    @app.get("/api/projects/{project_id}/comments", response_model=list[contract.ReviewComment])
    def comments(project_id: str):
        return service.comments(project_id)

    @app.post("/api/projects/{project_id}/comments", response_model=contract.ReviewComment)
    def comment(project_id: str, request: CommentRequest):
        return service.comment(project_id, **request.model_dump())

    @app.patch("/api/projects/{project_id}/comments/{comment_id}", response_model=contract.ReviewComment)
    def resolve_comment(project_id: str, comment_id: str):
        return service.resolve_comment(project_id, comment_id)

    @app.get("/api/projects/{project_id}/captions.srt", response_class=PlainTextResponse)
    def captions(project_id: str, revision: int | None = None, include_muted: bool = False):
        result = service.captions(project_id, revision, include_muted)
        return PlainTextResponse(
            result["text"],
            headers={
                "Content-Disposition": 'attachment; filename="captions.srt"',
                "X-Project-Revision": str(result["revision"]),
            },
        )

    register_http(app, production)
    from .channel_routes import register_channel_http

    register_channel_http(app, service)
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/api/"):
            route.description = REST_DESCRIPTIONS[route.name]
            route.tags = [
                "Agent discovery"
                if route.name in {"read_agent_guide", "project_schema", "operation_schema", "capabilities"}
                else "Composition"
            ]
            route.operation_id = route.name

    from .openapi import install_openapi

    install_openapi(app)

    app.mount("/mcp", mcp.streamable_http_app())
    # Expose only media directories, never the database or its WAL files.
    for name in ("library", "renders", "cache", "channel-logos"):
        app.mount(f"/media/{name}", StaticFiles(directory=store.root / name), name=f"media-{name}")
    return app
