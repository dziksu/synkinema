from typing import Annotated

from mcp.server.fastmcp import FastMCP, Image
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import Field

from . import __version__
from .agent_reference import AGENT_INSTRUCTIONS, agent_guide, operation_reference
from .api_contract import (
    AssetBatchUpdate,
    AssetMetadataUpdate,
    DeleteAssetsRequest,
    DeleteJobsRequest,
    RemoveAssetLocation,
)
from .deletion import Deletion
from .exporting import ExportOutput, export_catalog
from .mcp_inputs import (
    AssetId,
    AssetKind,
    FolderId,
    OptionalChannelId,
    OptionalFolderId,
    OptionalProjectId,
    OptionalRenderJobId,
    OptionalRevision,
    OptionalTimelineMs,
    ProjectId,
    RenderJobId,
    RenderQuality,
    Revision,
    TimelineMs,
)
from .models import BatchRequest, CloneRequest, Operation, Project, RenderRequest
from .renderer import CAPABILITIES
from .voices import VoiceRequest, Voices


def make_mcp(service, worker, inspection, voices=None, production=None):
    voices = voices or Voices(service)
    mcp = FastMCP(
        "Synkinema",
        instructions=AGENT_INSTRUCTIONS,
        stateless_http=True,
        json_response=True,
        streamable_http_path="/",
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["localhost:*", "127.0.0.1:*", "[::1]:*", "testserver"],
            allowed_origins=["http://localhost:*", "http://127.0.0.1:*"],
        ),
    )
    # FastMCP has no public version parameter; the protocol server owns serverInfo.
    mcp._mcp_server.version = __version__
    from .channel_routes import register_channel_mcp

    register_channel_mcp(mcp, service)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def list_projects() -> list[dict]:
        """Read all saved projects including complete tracks/clips, computed duration_ms and current revision. No pagination. Use get_project before an edit to refresh the revision; use returned IDs."""
        return service.projects()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_project(project_id: ProjectId, revision: OptionalRevision = None) -> dict:
        """Read a complete Project, computed duration_ms and live channel_context (rules and recent reviews; null for independent projects). Read channel guidance before scripting, TTS or editing. Omit revision for current; set it for an immutable historical timeline with CURRENT channel guidance/version. Unknown project/revision returns a tool error."""
        return service.summary(service.get(project_id, revision))

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    def create_project(
        name: Annotated[str, Field(description="Human-readable project name, 1–200 characters.")],
        brief: Annotated[
            str,
            Field(
                description="Optional creative brief retained with the editable project; not executable instructions."
            ),
        ] = "",
        channel_id: OptionalChannelId = None,
    ) -> dict:
        """Create a new 1080x1920, 30 FPS reel at revision 1 with video/titles/voice/music track IDs. Optional channel_id attaches a local editorial channel; null/omitted is independent. Returns full Project including id, duration_ms and live channel_context: apply its language, voice, hook/CTA and production rules. Repeating creates another project. To change format use update_project with profile; to continue work use get_project instead."""
        return service.summary(service.create(Project(name=name, brief=brief, channel_id=channel_id)))

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    def apply_operation(project_id: ProjectId, operation: Operation) -> dict:
        """Apply ONE atomic operation and return full updated Project including new revision and duration_ms. operation is {expected_revision,type,payload}. Read get_operation_reference(operation=type) for exact payload schema and side effects. Supports update_project, add/update/reorder/remove_track, add/update/move/trim/split/remove_clip, set_transition, restore_revision. Serialize writes; use returned revision. Stale revisions reject: reread and reconcile instead of blind retry. append_clip, duplicate_clip and extract_audio are explicit helpers; no implicit snapping or retiming. Arrays and nested objects are shallow replacements."""
        return service.summary(service.apply(project_id, operation))

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_project_schema() -> dict:
        """Return Project JSON Schema with nested Clip/Track/Profile models and field bounds. Cross-field rules (source duration, fades, keyframe timing, overlaps) are in get_agent_guide; effect/property-dependent bounds are in get_capabilities. Operation payloads are in get_operation_reference."""
        return Project.model_json_schema()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def search_assets(
        query: Annotated[
            str,
            Field(
                description="Case-insensitive substring matched against asset names and tags; empty lists all."
            ),
        ] = "",
        kind: AssetKind = None,
        project_id: OptionalProjectId = None,
        folder_id: OptionalFolderId = None,
    ) -> list[dict]:
        """Read shared library when project_id is omitted, or the project collection (including assets referenced by its clips) when provided. Optional folder_id filters that collection. Private imports are absent from shared search until locate_asset adds library membership. query matches name/tags by case-insensitive substring; kind is image/video/audio or null. Results include id, duration_ms, has_audio, dimensions, URLs, checksum, tags and source/license. A video may have no audio; inspect has_audio before adding to audio tracks."""
        return service.assets(query, kind, project_id, folder_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    def import_asset(
        filename: Annotated[
            str,
            Field(
                description="Display filename including a useful media extension; never a local/server path."
            ),
        ],
        data_base64: Annotated[
            str,
            Field(
                description="Raw standard base64 media bytes without a data-URL prefix; maximum 16 MiB encoded."
            ),
        ],
        tags: Annotated[
            list[str] | None, Field(description="Optional searchable tags; null/omitted stores no tags.")
        ] = None,
        source: Annotated[
            str, Field(description="Optional source page or attribution text retained with the asset.")
        ] = "",
        license: Annotated[
            str,
            Field(
                description="Optional known ownership/license text; availability never implies reuse rights."
            ),
        ] = "",
        project_id: OptionalProjectId = None,
        folder_id: OptionalFolderId = None,
    ) -> dict:
        """Import actual bytes as raw base64 (no data-URL prefix), max 12 MiB decoded /16 MiB encoded. filename is a display name/extension, not an agent/server path; no URL fetching. Return Asset with id, duration_ms and has_audio. project_id restricts the import to that project collection; omitted means shared library. folder_id must belong to that collection. Identical bytes reuse the existing Asset and add collection membership without merging name/tags. Does not add a clip or change project revision. Pass source/license attribution strings when known. For large public URL/Steam media use start_production_task import_media/import_steam_trailer (up to 512 MiB), then wait; no external downloader/upload required. Agent-local large files use Studio or REST multipart POST /api/assets, max 2 GiB."""
        import base64
        from pathlib import Path

        from .models import uid

        if len(data_base64) > 16 * 1024**2:
            raise ValueError("Use REST multipart upload for files over 12 MiB")
        path = service.store.path(f"uploads/{uid()}{Path(filename).suffix.lower()}")
        try:
            path.write_bytes(base64.b64decode(data_base64, validate=True))
            return service.import_file(
                path, Path(filename).name, tags, source, license, project_id, folder_id
            )
        finally:
            path.unlink(missing_ok=True)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def list_asset_folders(project_id: OptionalProjectId = None) -> list[dict]:
        """List {id,name} folders in shared library, or one project's private collection. Call before filtering/importing/moving by folder_id. Default shared folders include Sound effects, Music, Videos, Images and Voiceovers. Folder IDs, not names, are used by other commands."""
        return service.folders(project_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    def create_asset_folder(
        name: Annotated[
            str, Field(description="Folder name, 1–100 characters, unique within its collection.")
        ],
        project_id: OptionalProjectId = None,
    ) -> dict:
        """Create a named folder in shared library (omit project_id) or a project collection. Name 1–100 characters, unique ignoring case within that collection. Returns {id,name}. No project revision change; list first to avoid duplicate creation."""
        return service.create_folder(name, project_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def rename_asset_folder(
        folder_id: FolderId,
        name: Annotated[
            str, Field(description="New folder name, 1–100 characters, unique within its collection.")
        ],
    ) -> dict:
        """Rename an existing folder, preserving its ID, scope, contents and timeline references. Name must be unique within its collection. Returns {id,name}."""
        return service.rename_folder(folder_id, name)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def locate_asset(
        asset_id: AssetId,
        project_id: OptionalProjectId = None,
        folder_id: OptionalFolderId = None,
    ) -> dict:
        """Add or move an asset's membership in one collection. Omit project_id to share it to the library; set project_id to add it to private project media. Omit folder_id for collection root, or pass an ID from list_asset_folders in that scope. Other collections stay unchanged. Shares existing bytes, preserves clips and revisions. Returns Asset including locations {scope:folder_id}, with library as shared scope and empty string for root."""
        return service.locate_asset(asset_id, project_id, folder_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_voice_provider_status() -> dict:
        """Discover providers[] and default_provider with configuration, model IDs, limits, supported languages, preset voices, local/external mode and license links. No downloads, synthesis or charges. Legacy top-level provider/configured refer only to ElevenLabs. Check before generate_voice_take; installed model/runtime does not guarantee successful inference."""
        return voices.status()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=True
        )
    )
    async def generate_voice_take(request: VoiceRequest) -> dict:
        """Generate speech, not scripts. Discover get_voice_provider_status first. For local offline TTS use request={provider:'supertonic',text,voice_id:'F1',language:'pl',project_id?:id,steps?:8,speed?:1}. Exactly 31 supported language codes; na/auto/unsupported codes reject. No language detection/translation. F1–F5/M1–M5 presets; 1000-character limit; 4–16 steps; speed 0.7–2.0. Requires installed pinned Supertonic 3; no automatic model download. Label published output AI-generated per OpenRAIL-M. Legacy/default ElevenLabs requires server key and account voice_id, supports 5000 chars, sends text externally and consumes credits on cache misses: obtain authorization for paid synthesis. Returns {asset,cached} only after real import; project_id uses private media, omission shared Voiceovers. DOES NOT insert clips or change revision. Repeating identical synthesis in the same scope reuses output. Use returned asset/duration with add_clip on a voiceover track."""
        return await voices.generate(request)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False
        )
    )
    def tag_asset(
        asset_id: AssetId,
        tags: Annotated[
            list[str],
            Field(
                description="Complete replacement tag list; merge with current tags first to append safely."
            ),
        ],
    ) -> dict:
        """Replace ALL tags on an existing asset (max 50 strings, max 100 characters each); sorted and deduplicated. Returns updated Asset; no project revision change. To append a tag, read existing tags first and send the merged list. Source bytes and source/license remain unchanged."""
        return service.tag_asset(asset_id, tags)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_capabilities() -> dict:
        """Read implemented renderer features, effect and animation bounds, limits and discovery URLs. Consult with project schema and guide; advertised features do not imply browser preview fidelity or arbitrary FFmpeg filter support."""
        return CAPABILITIES

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_export_presets() -> dict:
        """Read supported output presets (16:9, 9:16, 1:1, 4:5; HD through UHD 4K), explicit pixel dimensions, CRF quality choices and frame rates. QHD/2K means 2560x1440 landscape, not DCI 2048. Pass chosen dimensions in start_render.output; no project changes."""
        return export_catalog().model_dump()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def plan_export(
        project_id: ProjectId,
        expected_revision: Revision,
        output: Annotated[
            ExportOutput | None,
            Field(
                description="Optional export-only geometry; omit/null to use the project's output profile."
            ),
        ] = None,
        quality: RenderQuality = "final",
    ) -> dict:
        """Read-only export geometry and source-upscale/crop warnings for the current guarded revision. Does not render or prove quality. output has width/height pixels, fps, crf, fit contain/cover, background and x/y alignment fractions. Contain preserves ALL layers with bars; cover crops the WHOLE composition including captions. No AI upscaling or motion interpolation. Inspect completed export by job_id."""
        return service.plan_export(
            project_id, RenderRequest(expected_revision=expected_revision, output=output, quality=quality)
        ).model_dump()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    def start_render(
        project_id: ProjectId,
        expected_revision: Revision,
        quality: RenderQuality = "final",
        from_ms: TimelineMs = 0,
        to_ms: OptionalTimelineMs = None,
        output: Annotated[
            ExportOutput | None,
            Field(
                description="Optional export-only geometry; omit/null to use the project's output profile."
            ),
        ] = None,
    ) -> dict:
        """Queue a render of the CURRENT project at expected_revision; return Job immediately, not a completed video. quality: preview (max 640px) or final (profile size or output override). Optional output {width,height,fps,crf,fit,background,x,y} adapts the entire composition without changing the project; discover get_export_presets and plan_export. from_ms/to_ms are absolute project milliseconds; null end means project end; require a nonempty in-bounds range. Snapshot is immutable even if project changes later. No deduplication: repeating queues another job. Poll get_render_progress(job_id) until completed/failed/cancelled; only completed yields output_url."""
        return service.enqueue(
            project_id,
            RenderRequest(
                expected_revision=expected_revision,
                quality=quality,
                from_ms=from_ms,
                to_ms=to_ms,
                output=output,
            ),
        )

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_render_progress(job_id: RenderJobId) -> dict:
        """Read one Job by id, including project_id, revision, status, progress (0..1), phase, error, request and output_url. Terminal states: completed/failed/cancelled. Poll about every 1-2 seconds with backoff. Resolve relative output_url against server origin; do not infer success from progress alone."""
        return service.public_job(service.store.job(job_id))

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False
        )
    )
    async def cancel_render(job_id: RenderJobId) -> dict:
        """Cancel a queued/running job and stop its FFmpeg task; returns resulting Job. Does not undo project edits or delete completed output. Already terminal jobs remain terminal. Use returned job status to confirm cancellation."""
        return await worker.cancel(job_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    async def render_frame(
        project_id: ProjectId,
        time_ms: TimelineMs,
        revision: OptionalRevision = None,
        job_id: OptionalRenderJobId = None,
    ) -> list:
        """Inspect an ACTUAL composited FFmpeg frame at absolute time_ms with 0 <= time_ms < duration_ms. Pin revision to the version being reviewed. Returns metadata plus ImageContent, which the agent must inspect visually. May synchronously render/cache a full preview; this is not a lightweight metadata read and does not create a queued job. Prefer job_id to inspect the exact completed export (including ranges); it determines revision even if revision was supplied. time_ms remains project-absolute, inside [from_ms,to_ms); output_time_ms is relative to the export. Missing files and invalid jobs fail without rendering a fallback."""
        result = await inspection.frame(project_id, time_ms, revision, job_id)
        return [{k: v for k, v in result.items() if k != "path"}, Image(path=result["path"])]

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    async def render_frames(
        project_id: ProjectId,
        timestamps_ms: Annotated[
            list[int] | None,
            Field(
                description="1–24 absolute project-timeline timestamps in integer milliseconds; omit for suggested points."
            ),
        ] = None,
        revision: OptionalRevision = None,
        job_id: OptionalRenderJobId = None,
    ) -> list:
        """Inspect a contact sheet of 1-24 actual FFmpeg frames. timestamps_ms are absolute project times, each before end; null/empty uses get_inspection_points. Pin revision. Returns metadata and ImageContent; visually review the image. May synchronously render/cache a full preview. Add overlay/transition boundary samples as needed; default points are not exhaustive. Prefer job_id for the exact completed export; it determines revision. Times remain project-absolute and must be inside the export range. Defaults filter points to that range, or use its midpoint when none remain. No fallback render for invalid jobs."""
        result = await inspection.sheet(project_id, timestamps_ms, revision, job_id)
        return [{k: v for k, v in result.items() if k != "path"}, Image(path=result["path"])]

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_inspection_points(project_id: ProjectId, revision: OptionalRevision = None) -> dict:
        """Read suggested absolute timestamps and revision, derived from primary-video/text clip midpoints and transition midpoints, capped at 24. Does not render, and is not scene-metadata analysis. Empty timelines may yield no points. Include additional overlay/boundary frames for thorough QA."""
        return inspection.points(project_id, revision)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    async def analyze_audio(
        project_id: ProjectId,
        revision: OptionalRevision = None,
        job_id: OptionalRenderJobId = None,
    ) -> list:
        """Measure actual output: prefer job_id from a completed job belonging to project_id. That job determines revision even if a different revision was supplied; without job_id uses a full preview of revision/current. Returns metadata plus audio-map ImageContent: integrated_lufs, true_peak_dbtp, RMS/sample peaks/silence windows, ebu_r128, warnings, map_url/audio_url. null loudness means silent/too short, not zero. For range jobs, windows timestamps are project-absolute; ebu_r128 timestamps are output-relative. May render/cache and take time. active_tracks includes unmuted audio tracks overlapping any portion of each window, not proof of isolated audibility. Windows include duration_ms; metadata includes job_id/from_ms/to_ms. Does not edit the mix."""
        result = await inspection.audio(project_id, revision, job_id)
        return [{k: v for k, v in result.items() if k != "map_path"}, Image(path=result["map_path"])]

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    def create_review_comment(
        project_id: ProjectId,
        revision: Revision,
        time_ms: TimelineMs,
        message: Annotated[str, Field(description="Nonblank review note, maximum 5000 characters.")],
    ) -> dict:
        """Create a note attached to a project revision and absolute time_ms (0..duration inclusive). Nonblank message up to 5000 chars. Returns comment id/resolved=false; does not increment project revision. Repeating duplicates the note. Use resolve_review_comment after fixing and verifying the issue."""
        return service.comment(project_id, revision, time_ms, message)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def list_review_comments(project_id: ProjectId) -> list[dict]:
        """Read all project review comments, including id, revision, time_ms, message and resolved. No project mutation. Notes can refer to older revisions; compare revision before acting."""
        return service.comments(project_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def list_revisions(project_id: ProjectId) -> list[dict]:
        """Read revision numbers, operation names and timestamps newest-first. Does not return historical content: use get_project(revision=R). restore_revision copies the chosen version into a NEW revision; retain target IDs for multi-step undo."""
        return service.history(project_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_agent_guide() -> str:
        """START HERE. Read the shipped agent workflow: discovery, units, source audio, all editing operations, shallow replacements, revision conflicts, render polling, inspection, limits, REST/MCP differences and worked examples. Also available as synkinema://agent-guide."""
        return agent_guide()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_operation_reference(
        operation: Annotated[
            str | None,
            Field(
                description="Exact apply_operation type to inspect; omit/null to return the complete catalog."
            ),
        ] = None,
    ) -> dict:
        """Read exact payload JSON Schema, example and side effects for one apply_operation type (e.g. trim_clip), or all supported operations if operation is null. Read BEFORE changing a timeline. IDs in examples are placeholders. This call never edits a project."""
        return operation_reference(operation)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    def apply_operations(
        project_id: ProjectId,
        request: BatchRequest,
        compact: Annotated[
            bool,
            Field(description="Return a token-efficient project header instead of the complete timeline."),
        ] = False,
    ) -> dict:
        """Apply 1-100 ordered edits as ONE transaction and ONE new revision. request={expected_revision,operations:[{type,payload}],dry_run:false}. Final Project/assets/timeline must validate; failure saves nothing. dry_run=true returns committed=false and candidate project at base_revision+1 without saving history. Prefer compact=true for counts and confirmed_revision instead of the full timeline; supply explicit clip IDs or retrieve generated IDs with get_edit_context. Use project.revision only after committed=true. Read get_operation_reference(operation=type). No imports/renders/provider calls inside batches."""
        from .agent_tools import compact_batch

        result = service.batch(project_id, request)
        return compact_batch(result) if compact else result

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
        )
    )
    def clone_project(
        project_id: ProjectId,
        name: Annotated[str, Field(description="Name for the independent cloned project, 1–200 characters.")],
        revision: Revision,
    ) -> dict:
        """Create an independent project from an EXACT source revision, with new project ID/name and revision 1. Tracks/clips keep IDs (scoped to project); library assets are shared, not duplicated. Source remains unchanged. Jobs, comments and history are not copied. Returns full Project with duration_ms. Repeating creates another copy; use for alternate cuts before editing."""
        request = CloneRequest(name=name, revision=revision)
        return service.summary(service.clone(project_id, request.name, request.revision))

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def validate_project(project_id: ProjectId, revision: OptionalRevision = None) -> dict:
        """Cheap preflight of current/pinned revision; no render or mutation. Returns valid, errors/warnings[{code,message,...IDs/times}], counts, revision and duration_ms. Checks source references/files, source bounds, track compatibility, primary overlaps; warns about absent audio/visuals, primary gaps, muted tails and legacy_lane_overlap for old overlapping audio/text/overlay clips. All writes reject new or retimed ordinary overlaps on every track, including muted. valid means no detected structural errors, NOT successful media decoding or visual/audio quality. Run before start_render, then inspect real output."""
        return service.preflight(project_id, revision)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_asset(asset_id: AssetId) -> dict:
        """Read one imported asset by its exact ID: duration_ms, kind, has_audio, dimensions, URL, thumbnail, checksum, tags, source/license. Unknown ID is a tool error. Does not decode or inspect frames. Use metadata before choosing source_in_ms/duration_ms/speed or extracting audio."""
        return service.asset(asset_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def list_render_jobs(project_id: OptionalProjectId = None) -> list[dict]:
        """Read latest 100 render jobs, optionally scoped to one project BEFORE limiting. Returns status, revision, progress, request and output_url, without internal snapshots. Use to rediscover an existing job after reconnecting instead of queueing a duplicate; retain job_id for older results."""
        return service.jobs(project_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def resolve_review_comment(
        project_id: ProjectId,
        comment_id: Annotated[
            str, Field(description="Exact review-comment ID returned by list_review_comments.")
        ],
    ) -> dict:
        """Mark an existing comment belonging to this project resolved=true; returns the comment. Repeating leaves it resolved. Unknown/wrong-project comment returns an error. Does not alter project revision, delete the note, or implement the requested edit: fix and verify first."""
        return service.resolve_comment(project_id, comment_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def export_captions(
        project_id: ProjectId,
        revision: OptionalRevision = None,
        include_muted: Annotated[
            bool, Field(description="Include captions from muted text tracks when true; default false.")
        ] = False,
    ) -> dict:
        """Return {project_id,revision,format:'srt',text,cue_count} from text tracks, ordered by absolute start_ms, headline plus subtitle. Pin revision for reproducibility. Muted tracks excluded unless include_muted=true. This exports existing text, not speech transcription or automatic subtitles; overlapping text clips remain overlapping SRT cues."""
        return service.captions(project_id, revision, include_muted)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    async def delete_render_jobs(request: DeleteJobsRequest) -> dict:
        """Permanently delete exact job_ids, or clear status=finished (default)/all with optional project_id scope. All includes running/queued work, which is stopped and awaited first. Applies beyond latest-100 list limit. Removes MP4/partial files and project inspection caches from disk, never source media. No undo. Returns deleted IDs, freed_bytes and pending_files; nonzero pending_files means metadata deletion committed but disk cleanup will retry every 10 seconds/restart. See retry_file_cleanup. Missing exact IDs fail before cancellation."""
        return await Deletion(service, worker, inspection).jobs(request)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    async def delete_project(project_id: ProjectId, expected_revision: Revision) -> dict:
        """Permanently delete a project, all revisions/comments/exports/private folders and exclusive private source files. Stops and awaits its active renders. Requires current expected_revision; conflict means reread and reconcile. Shared library assets and sources referenced by other projects/history are retained. Removes project inspection and unused current-version render caches. No undo. Returns deleted IDs, actual freed_bytes, pending_files; pending disk failures persist and retry automatically. Confirm user intent before deleting user content."""
        return await Deletion(service, worker, inspection).project(project_id, expected_revision)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False
        )
    )
    async def retry_file_cleanup() -> dict:
        """Retry physical removal of files already scheduled by committed project/export deletions; does not select additional content to delete. Returns deleted_files, freed_bytes and pending_files. Nonzero pending count means disk cleanup remains incomplete (e.g. filesystem permission failure); worker retries every 10 seconds and after restart. Safe to repeat."""
        async with inspection.lifecycle:
            return service.store.cleanup_files()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def list_stored_media() -> list[dict]:
        """Read the local owner's entire stored-media inventory, including private/history-only files. Does not share them. Prefer search_assets for collection-scoped reads. Each Asset has a metadata version (legacy default 1), name/tags/source/license and locations. Read usage before deleting; privacy here is collection organization within the same local workspace, not multi-user access control."""
        return service.asset_inventory()

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
        )
    )
    def get_asset_usage(asset_id: AssetId) -> dict:
        """Read can_delete and project references for a file: current timeline/asset_ids, historical revision numbers and render job IDs. Names identify blocking projects. History protects undo. Memberships alone do not block physical deletion. Advisory snapshot only: delete_media rechecks under transaction. No project or file mutation."""
        return service.asset_usage(asset_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    def update_asset_metadata(asset_id: AssetId, request: AssetMetadataUpdate) -> dict:
        """Replace editable metadata with {expected_version,name,tags,source,license}. Supply the confirmed Asset.version, reread/reconcile after conflict. Changes apply to all collections, without changing ID/original bytes or project revisions. Tags are trimmed, unique, max 50 of 100 chars. Returns updated Asset. For additive tags prefer edit_media_batch to preserve concurrent independent tags."""
        return service.update_asset(asset_id, request)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    def remove_media_membership(asset_id: AssetId, request: RemoveAssetLocation) -> dict:
        """Unshare/remove one collection membership; {expected_version,project_id?}, omit project_id for shared library. Keeps bytes and project history. Unsharing ensures referencing projects retain private access. Current project use blocks removal from that project. Last membership of an unused file cannot be detached: use delete_media instead. Conflict/missing ID saves nothing. Returns updated Asset; no timeline revision changes."""
        return service.remove_asset_location(asset_id, request)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False
        )
    )
    def edit_media_batch(request: AssetBatchUpdate) -> list[dict]:
        """Atomically add/remove tags or locate 1–100 distinct asset_ids. action=add_tags/remove_tags takes tags and preserves unrelated tags; locate takes destination={project_id?,folder_id?}, preserves other collections and reuses bytes. Validates the whole selection before saving. Returns updated Asset list. No project changes, no file copies and no physical deletion."""
        return service.batch_assets(request)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    async def delete_media(request: DeleteAssetsRequest) -> dict:
        """Permanently delete original files/thumbnails across all collections: {assets:[{id,expected_version}]} (1–100 distinct IDs). Confirm intended scope. Any current/historical project or render snapshot reference blocks the entire selection, as does a stale version/missing ID. No force or undo. Returns deleted IDs and physical cleanup metrics. Nonzero pending_files means committed metadata deletion with durable disk retries; use retry_file_cleanup. To hide a used file from shared library, use remove_media_membership instead."""
        return await Deletion(service, worker, inspection).assets(request)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
        )
    )
    def delete_asset_folder(folder_id: FolderId) -> dict:
        """Remove a named folder while keeping every file. Contents move to that collection's root atomically; other memberships/tags/project references remain. Returns folder_id, project_id (null for shared library) and changed Asset list. Missing ID fails. Use delete_media separately only when actual source-file deletion is intended."""
        return service.delete_folder(folder_id)

    @mcp.resource(
        "synkinema://agent-guide",
        mime_type="text/markdown",
        description="Complete agent operating guide and worked REST/MCP workflow.",
    )
    def guide_resource() -> str:
        return agent_guide()

    @mcp.resource(
        "synkinema://operations",
        mime_type="application/json",
        description="Payload schemas, examples and side effects for every editing operation.",
    )
    def operations_resource() -> str:
        import json

        return json.dumps(operation_reference(), ensure_ascii=False)

    from .agent_tools import register_agent_tools
    from .production.engine import Production
    from .production.routes import register_mcp

    production = production or Production(service, inspection, voices)
    register_mcp(mcp, production)
    register_agent_tools(mcp, service, inspection, production)
    return mcp
