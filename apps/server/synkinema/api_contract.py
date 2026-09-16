"""HTTP response contracts. OpenAPI is the source for the Studio's generated client."""

from typing import Literal

from pydantic import ConfigDict, Field, JsonValue, create_model

from .channels import ChannelContext
from .exporting import ExportOutput, ExportWarning
from .models import AssetLocation, Clip, Model, OutputProfile, Project, RenderRequest

# Reuse input fields and validators' field constraints; duration is a response-only value.
ProjectSnapshot = create_model(
    "ProjectSnapshot",
    __base__=Model,
    **{name: (field.annotation, field) for name, field in Project.model_fields.items()},
    duration_ms=(int, Field(ge=0, description="Maximum clip end, including muted tracks, in milliseconds.")),
    created_at=(
        str,
        Field(
            "",
            description="Immutable project creation time from its first persisted revision, in ISO 8601 UTC. Empty only for an unpersisted snapshot.",
        ),
    ),
    channel_context=(
        ChannelContext | None,
        Field(
            None,
            description="Live editorial channel context, even for historical project reads; not part of the immutable timeline snapshot.",
        ),
    ),
)


class Health(Model):
    status: Literal["ok"]
    version: str
    ffmpeg: bool
    ffprobe: bool


class MediaMetadata(Model):
    kind: Literal["image", "video", "audio"]
    width: int | None
    height: int | None
    duration_ms: int | None
    has_audio: bool
    audio_duration_ms: int | None = Field(
        None, description="Measured audio stream duration; null for older metadata or missing audio."
    )
    codec: str | None
    size: int


class Asset(MediaMetadata):
    version: int = Field(
        1,
        ge=1,
        description="Metadata/membership version; legacy assets start at 1. Use for guarded metadata edits and deletion.",
    )
    id: str
    name: str
    path: str
    url: str
    checksum: str
    tags: list[str]
    source: str
    license: str
    created_at: str
    thumbnail_url: str | None = None
    locations: dict[str, str] = Field(
        default_factory=dict,
        description="Collection ID (library or project ID) to folder ID; empty string means root.",
    )


class AssetFolder(Model):
    id: str
    name: str


class RenderJob(Model):
    id: str
    project_id: str
    project_name: str
    revision: int
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    progress: float
    phase: str
    created_at: str
    request: RenderRequest
    error: str | None
    output_url: str | None
    started_at: str | None = None
    finished_at: str | None = None
    render_seconds: float | None = None
    metadata: MediaMetadata | None = None
    output: ExportOutput | None = Field(
        None,
        description="Resolved encoded settings, including the 640 px cap for previews. Null only for legacy jobs.",
    )
    warnings: list[ExportWarning] = Field(
        default_factory=list,
        description="Source enlargement/framing warnings; not a claim of visual quality.",
    )


class Revision(Model):
    revision: int
    operation: str
    created_at: str


class ReviewComment(Model):
    id: str
    project_id: str
    revision: int
    time_ms: int
    message: str
    resolved: bool
    created_at: str


class BatchResult(Model):
    committed: bool
    base_revision: int
    applied_operations: int
    project: ProjectSnapshot


class Issue(Model):
    code: str
    message: str
    track_id: str | None = None
    clip_id: str | None = None
    asset_id: str | None = None
    from_ms: int | None = None
    to_ms: int | None = None


class Preflight(Model):
    project_id: str
    revision: int
    duration_ms: int
    valid: bool
    errors: list[Issue]
    warnings: list[Issue]
    track_count: int
    clip_count: int
    asset_count: int
    requires_render_review: bool


class VoiceChoice(Model):
    id: str
    name: str


class VoiceProvider(Model):
    id: Literal["supertonic", "elevenlabs"]
    name: str
    local: bool = Field(
        description="True means synthesis is offline on this server; installation downloads are separate."
    )
    configured: bool = Field(
        description="Required runtime/model or credentials are present. Generation may still fail; inspect its result."
    )
    input_limit: int
    model_id: str
    languages: list[VoiceChoice] = Field(
        description="Supertonic's explicit 31-code allowlist. Empty for ElevenLabs, whose model manages languages."
    )
    voices: list[VoiceChoice] = Field(
        description="Local preset voices; empty for ElevenLabs, which requires a user's account voice ID."
    )
    reason: str | None
    license_url: str
    upstream_archived: bool


class VoiceStatus(Model):
    provider: str
    configured: bool
    input_limit: int
    import_supported: bool
    default_provider: Literal["supertonic", "elevenlabs"]
    providers: list[VoiceProvider]


class VoiceResult(Model):
    asset: Asset
    cached: bool


class InspectionRange(Model):
    revision: int
    job_id: str | None
    from_ms: int
    to_ms: int


class InspectionFrame(InspectionRange):
    project_id: str
    time_ms: int
    output_time_ms: int
    url: str
    path: str


class InspectionSheet(InspectionRange):
    timestamps_ms: list[int]
    url: str
    path: str


class InspectionPoints(Model):
    revision: int
    timestamps_ms: list[int]


class AudioWindow(Model):
    time_ms: int
    duration_ms: int
    rms_dbfs: float
    sample_peak_dbfs: float
    active_tracks: list[str]
    silence: bool
    clipping: bool


class LoudnessSample(Model):
    time_ms: int
    momentary_lufs: float
    short_term_lufs: float


class AudioWarning(Model):
    type: str
    message: str


class AudioReport(InspectionRange):
    integrated_lufs: float | None
    true_peak_dbtp: float | None
    loudness_range: float | None
    target_lufs: float
    windows: list[AudioWindow]
    ebu_r128: list[LoudnessSample]
    warnings: list[AudioWarning]
    map_url: str
    audio_url: str
    map_path: str


class ProjectVersion(Model):
    id: str
    revision: int


class StateSnapshot(Model):
    projects: list[ProjectVersion]
    jobs: list[RenderJob]


class TextLayerRequest(Model):
    clip: Clip
    profile: OutputProfile


class CaptionBounds(Model):
    left: int = Field(ge=0, description="Left edge in output-profile pixels, clipped to the frame.")
    top: int = Field(
        ge=0, description="Top edge in output-profile pixels, after layout and vertical clamping."
    )
    width: int = Field(gt=0, description="Foreground width in pixels, including strokes and caption boxes.")
    height: int = Field(
        gt=0, description="Foreground height in pixels, including wrapped lines, subtitle and accent."
    )


class CaptionPreview(Model):
    url: str = Field(
        description="Content-addressed transparent PNG under /media/cache/, from the export renderer."
    )
    width: int = Field(gt=0, description="Full raster width in output-profile pixels.")
    height: int = Field(gt=0, description="Full raster height in output-profile pixels.")
    bounds: CaptionBounds | None = Field(
        description="Visible caption bounds, excluding the editorial contrast gradient. Null when there is no caption foreground. Paired atomically with url; never reuse across different requests."
    )


class ValidationIssue(Model):
    # FastAPI's exception handler omits optional context/input; it bypasses response_model.
    model_config = ConfigDict(json_schema_serialization_defaults_required=False)
    loc: list[str | int]
    msg: str
    type: str
    input: JsonValue = None
    ctx: dict[str, JsonValue] | None = None


class ApiError(Model):
    detail: str | list[ValidationIssue]


class Capabilities(Model):
    renderer: str
    editing_helpers: list[str]
    agent_guide_url: str
    project_schema_url: str
    operation_reference_url: str
    effect_bounds: dict[str, list[float]]
    animation_bounds: dict[str, list[float]]
    limits: dict[str, int]
    transitions: list[str]
    effects: list[str]
    animations: list[str]
    easing: list[str]
    caption_styles: list[str]
    shapes: list[str]
    audio: list[str]
    inspection: list[str]
    notes: list[str]


class DeleteJobsRequest(Model):
    job_ids: list[str] | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="Exact selection (1–100 distinct existing job IDs). When set, status is ignored; queued/running jobs are cancelled first.",
    )
    project_id: str | None = Field(
        None, description="Limit deletion to this project; omitted means all projects."
    )
    status: Literal["finished", "all"] = Field(
        "finished",
        description="Without job_ids: finished deletes completed/failed/cancelled; all also cancels and deletes active jobs. Applies to the entire database, not the latest-100 display limit.",
    )


class DeleteProjectRequest(Model):
    expected_revision: int = Field(
        ge=1,
        description="Current confirmed project revision. A stale revision returns 409 without deleting the project.",
    )


class CleanupResult(Model):
    deleted_files: int = Field(
        ge=0, description="Existing nonempty files physically removed by this cleanup pass."
    )
    freed_bytes: int = Field(ge=0, description="Bytes physically unlinked in this pass, not an estimate.")
    pending_files: int = Field(
        ge=0,
        description="Durable pending cleanup entries; nonzero means deletion committed but disk cleanup is incomplete. Retried every 10 seconds and after restart.",
    )


class DeletionResult(CleanupResult):
    job_ids: list[str]
    project_ids: list[str]
    asset_ids: list[str] = Field(
        description="Exclusive private sources deleted. Shared library and other projects' historical sources are preserved."
    )


class AssetVersion(Model):
    expected_version: int = Field(
        ge=1, description="Confirmed asset metadata version. Stale version returns 409; reload and reconcile."
    )


class RemoveScriptAudioRequest(AssetVersion):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"expected_revision": 3, "expected_version": 1, "audio_asset_id": "RETURNED_AUDIO_ASSET_ID"}
            ]
        }
    )
    expected_revision: int = Field(
        ge=1, description="Last confirmed project revision; conflicts reject atomically."
    )
    audio_asset_id: str = Field(
        min_length=1,
        description="Exact take currently attached to the selected line; a different take returns 409.",
    )


class RemoveScriptAudioResult(DeletionResult):
    project: ProjectSnapshot
    retained_asset_id: str | None = Field(
        None,
        description="Source retained only because another collection/project/history still uses it. Removed from this project's collection regardless.",
    )


class AssetMetadataUpdate(AssetVersion):
    name: str = Field(min_length=1, max_length=300)
    tags: list[str] = Field(max_length=50)
    source: str = Field(max_length=5000)
    license: str = Field(max_length=2000)


class RemoveAssetLocation(AssetVersion):
    project_id: str | None = Field(
        None,
        description="Omit for shared library. Removing membership retains bytes. Current project timeline/asset-list references block removal from that project.",
    )


class AssetSelection(Model):
    asset_ids: list[str] = Field(min_length=1, max_length=100)


class AssetBatchUpdate(AssetSelection):
    action: Literal["add_tags", "remove_tags", "locate"]
    tags: list[str] = Field(
        default_factory=list,
        max_length=50,
        description="Tags to merge/remove atomically. Case-sensitive, trimmed, deduplicated; never replaces unrelated tags.",
    )
    destination: AssetLocation | None = Field(
        None,
        description="Required only for locate. Adds/moves membership in one scope; keeps every other collection and never copies bytes.",
    )


class AssetDeleteItem(AssetVersion):
    id: str


class DeleteAssetsRequest(Model):
    assets: list[AssetDeleteItem] = Field(
        min_length=1,
        max_length=100,
        description="Atomic selection. All assets must match version and be unused in ALL current/historical projects and render snapshots, or nothing is deleted.",
    )


class AssetProjectUsage(Model):
    project_id: str
    name: str
    current: bool
    revisions: list[int]
    job_ids: list[str]


class AssetUsage(Model):
    asset_id: str
    version: int
    can_delete: bool
    projects: list[AssetProjectUsage]


class FolderDeletion(Model):
    folder_id: str
    project_id: str | None
    assets: list[Asset] = Field(
        description="Updated memberships: folder contents move to this collection's root. No file or project deletion."
    )
