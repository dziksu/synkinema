"""Typed production requests shared by REST, generated clients and MCP."""

from typing import Annotated, Any, Literal

from pydantic import Field, model_validator

from ..api_contract import Asset, AudioReport, CaptionBounds, ProjectSnapshot, VoiceProvider
from ..models import Model, OutputProfile
from ..supertonic_tts import Language


class MediaSource(Model):
    url: str = Field(
        min_length=8,
        max_length=4096,
        description="Public HTTP(S) direct media or unencrypted VOD HLS URL; never a local path.",
    )
    filename: str = Field("source.mp4", min_length=1, max_length=180)
    source: str = Field(
        "", max_length=4096, description="Source page / attribution, retained on the imported asset."
    )
    license: str = Field(
        "",
        max_length=4096,
        description="Known ownership/license; availability does not grant a reuse license.",
    )
    tags: list[str] = Field(default_factory=list, max_length=50)
    from_ms: int = Field(0, ge=0, le=3_600_000)
    to_ms: int | None = Field(
        None,
        gt=0,
        le=3_600_000,
        description="Exclusive source end. HLS defaults to at most the first 120 seconds. Direct files are not trimmed unless an interval is supplied.",
    )
    max_height: int = Field(1080, ge=240, le=2160)
    include_audio: bool = Field(
        False,
        description="Keep embedded audio when importing video. Audio-only media retain their audio. Video defaults to silent for separate editing tracks.",
    )

    @model_validator(mode="after")
    def interval(self):
        if self.to_ms is not None and (self.to_ms <= self.from_ms or self.to_ms - self.from_ms > 600_000):
            raise ValueError("Choose a nonempty source range of at most 10 minutes")
        return self


class ImportMedia(Model):
    type: Literal["import_media"] = "import_media"
    project_id: str
    folder_id: str | None = None
    sources: list[MediaSource] = Field(min_length=1, max_length=8)


class ImportSteam(Model):
    type: Literal["import_steam_trailer"] = "import_steam_trailer"
    project_id: str
    folder_id: str | None = None
    app_id: int = Field(gt=0)
    movie_id: int = Field(
        gt=0,
        description="Exact returned Steam movie ID. Select after get_steam_games, never assume the first trailer is gameplay.",
    )
    from_ms: int = Field(0, ge=0)
    to_ms: int = Field(120_000, gt=0)
    max_height: int = Field(1080, ge=240, le=2160)

    @model_validator(mode="after")
    def interval(self):
        if self.to_ms <= self.from_ms or self.to_ms - self.from_ms > 600_000:
            raise ValueError("Choose a nonempty source range of at most 10 minutes")
        return self


class InstallTranscriber(Model):
    type: Literal["install_transcriber"] = "install_transcriber"
    model: Literal["tiny.en", "tiny"] = "tiny.en"


class SteamTrailerSelection(Model):
    app_id: int = Field(gt=0)
    movie_id: int = Field(gt=0)
    from_ms: int = Field(0, ge=0)
    to_ms: int = Field(120_000, gt=0)
    max_height: int = Field(1080, ge=240, le=2160)

    _interval = model_validator(mode="after")(ImportSteam.interval)


class ImportSteamBatch(Model):
    type: Literal["import_steam_trailers"] = "import_steam_trailers"
    project_id: str
    folder_id: str | None = None
    trailers: list[SteamTrailerSelection] = Field(min_length=1, max_length=8)


class InstallVoiceModel(Model):
    """Install the pinned local Supertonic 3 weights and license; no paid provider or timeline edit."""

    type: Literal["install_voice_model"] = "install_voice_model"


class Transcribe(Model):
    type: Literal["transcribe"] = "transcribe"
    asset_id: str | None = None
    job_id: str | None = None
    language: Language = "en"
    model: Literal["tiny.en", "tiny"] = "tiny.en"
    reference_text: str | None = Field(
        None,
        max_length=30_000,
        description="Optional authored text for alignment/comparison AFTER independent ASR. Never passed as a recognition prompt.",
    )

    @model_validator(mode="after")
    def target(self):
        if bool(self.asset_id) == bool(self.job_id):
            raise ValueError("Choose exactly one asset_id or completed job_id")
        if self.model == "tiny.en" and self.language != "en":
            raise ValueError("tiny.en supports English only; install/use tiny for other supported languages")
        return self


class NarrationLine(Model):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,60}$")
    text: str = Field(min_length=1, max_length=1000)


class PrepareNarration(Model):
    type: Literal["prepare_narration"] = "prepare_narration"
    project_id: str
    folder_id: str | None = None
    lines: list[NarrationLine] = Field(min_length=1, max_length=20)
    voice_id: Literal["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"] = "M2"
    language: Language = "en"
    model: Literal["tiny.en", "tiny"] = "tiny.en"
    speed: float = Field(1.08, ge=0.7, le=2)
    steps: int = Field(12, ge=4, le=16)

    @model_validator(mode="after")
    def valid_lines(self):
        if len({x.id for x in self.lines}) != len(self.lines):
            raise ValueError("Narration line IDs must be unique")
        if self.model == "tiny.en" and self.language != "en":
            raise ValueError("Use multilingual tiny for non-English narration")
        return self


class GenerateScore(Model):
    type: Literal["generate_score"] = "generate_score"
    project_id: str
    folder_id: str | None = None
    duration_ms: int = Field(43_000, ge=1000, le=600_000)
    bpm: int = Field(96, ge=40, le=180)
    seed: int = Field(1, ge=0, le=2**32 - 1)
    mood: Literal["horror", "pulse", "ambient"] = "horror"
    accents_ms: list[int] = Field(default_factory=list, max_length=100)


class VerifyRender(Model):
    type: Literal["verify_render"] = "verify_render"
    job_id: str
    transcribe: bool = False
    language: Language = "en"
    model: Literal["tiny.en", "tiny"] = "tiny.en"
    reference_text: str | None = Field(None, max_length=30_000)

    @model_validator(mode="after")
    def recognition(self):
        if self.reference_text is not None and not self.transcribe:
            raise ValueError("reference_text requires transcribe=true")
        if self.transcribe and self.model == "tiny.en" and self.language != "en":
            raise ValueError("Use multilingual tiny for non-English transcription")
        return self


class PackageDelivery(Model):
    type: Literal["package_delivery"] = "package_delivery"
    job_id: str
    verification_task_id: str
    caption_track_ids: list[str] | None = None


ProductionRequest = Annotated[
    ImportMedia
    | ImportSteam
    | ImportSteamBatch
    | InstallTranscriber
    | InstallVoiceModel
    | Transcribe
    | PrepareNarration
    | GenerateScore
    | VerifyRender
    | PackageDelivery,
    Field(discriminator="type"),
]


class StartProduction(Model):
    request_key: str = Field(
        min_length=8,
        max_length=100,
        description="Caller-chosen idempotency key. Same key and request returns the existing task, including failures. A changed payload under the same key conflicts; use a new key for an intentional retry.",
    )
    request: ProductionRequest


class WordTiming(Model):
    word: str
    start_ms: int
    end_ms: int
    probability: float | None = None
    estimated: bool = False


class Transcript(Model):
    language: str
    model: str
    model_revision: str
    text: str
    words: list[WordTiming]
    aligned_words: list[WordTiming] = Field(default_factory=list)
    reference_text: str | None = None
    match_ratio: float | None = None
    speech_end_ms: int
    warnings: list[str] = Field(default_factory=list)


class NarrationTake(Model):
    id: str
    text: str
    asset: Asset
    transcript: Transcript


class Delivery(Model):
    project_id: str
    revision: int
    job_id: str
    video_url: str
    bundle_url: str
    captions_url: str
    sha256: str
    size_bytes: int
    verification_passed: bool = Field(
        description="A delivery can include a report with warnings. Packaging does not imply QA approval."
    )


class ProductionResult(Model):
    assets: list[Asset] = Field(default_factory=list)
    narration: list[NarrationTake] = Field(default_factory=list)
    transcript: Transcript | None = None
    verification: "VerificationReport | None" = Field(
        None,
        description="Versioned measured FFprobe, decode, SHA-256, audio, caption layout and optional independent ASR report. Checks report measured failures; successful task execution alone is not a passed video.",
    )
    delivery: Delivery | None = None
    model_status: "TranscriberStatus | None" = None
    voice_model: VoiceProvider | None = None
    import_errors: list["TrailerImportError"] = Field(default_factory=list)


class TrailerImportError(Model):
    index: int = Field(ge=0, description="Zero-based index in trailers.")
    app_id: int
    movie_id: int
    error: str


class ProductionTask(Model):
    id: str
    request_key: str
    request: ProductionRequest
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    phase: str
    progress: float = Field(ge=0, le=1)
    cancel_requested: bool = False
    created_at: str
    updated_at: str
    error: str | None = None
    result: ProductionResult = Field(default_factory=ProductionResult)


class SourceInspection(Model):
    asset_id: str
    timestamps_ms: list[int] | None = Field(None, min_length=1, max_length=24)
    from_ms: int = Field(0, ge=0)
    to_ms: int | None = Field(None, gt=0)
    count: int = Field(
        12,
        ge=1,
        le=24,
        description="Evenly spaced source samples. For a proposed cut use count=3: start, middle and near the end (100ms margin). Images return one sample.",
    )


class SourceSheet(Model):
    asset_id: str
    checksum: str
    timestamps_ms: list[int]
    url: str
    width: int
    height: int


class SourcePreviewRequest(Model):
    asset_id: str
    from_ms: int = Field(0, ge=0)
    to_ms: int = Field(gt=0, description="Exclusive source end, at most 15 seconds after from_ms.")
    format: Literal["mp4", "gif", "wav"] = "mp4"
    include_audio: bool = True

    @model_validator(mode="after")
    def interval(self):
        if not 0 < self.to_ms - self.from_ms <= 15_000:
            raise ValueError("Preview requires a nonempty interval of at most 15 seconds")
        return self


class SourcePreview(Model):
    asset_id: str
    checksum: str
    from_ms: int
    to_ms: int
    duration_ms: int
    url: str
    mime_type: str
    has_audio: bool
    note: str = "Real source excerpt. Client playback/audio support varies; generating a preview does not prove it was watched or heard."


class LayoutRequest(Model):
    project_id: str
    revision: int | None = None


class LayoutItem(Model):
    track_id: str
    clip_id: str
    text: str
    start_ms: int
    end_ms: int
    bounds: CaptionBounds | None
    unclipped_bounds: dict[str, int] | None
    clipped: bool


class LayoutReport(Model):
    revision: int
    passed: bool
    items: list[LayoutItem]
    issues: list[dict[str, Any]]


class ReelShot(Model):
    asset_id: str
    source_in_ms: int = Field(0, ge=0)
    brightness: float = Field(0, ge=-1, le=1)
    duration_ms: int | None = Field(
        None,
        ge=100,
        le=120_000,
        description="Set for every shot in the beat or omit for all. Explicit durations must sum to the beat duration within one frame.",
    )


class ReelBeat(Model):
    id: str = Field(
        pattern=r"^[a-zA-Z0-9_-]{1,60}$",
        description="ID of a completed narration line, or unique beat ID if using narration_asset_id.",
    )
    role: Literal["hook", "feature", "outro", "scene"] = "feature"
    title: str = Field(min_length=1, max_length=150)
    subtitle: str = Field("", max_length=180)
    tagline: str = Field("", max_length=120)
    duration_ms: int | None = Field(
        None,
        ge=1000,
        le=120_000,
        description="Omit to fit actual voice duration with breathing room. Explicit times never speed up or trim speech implicitly.",
    )
    shots: list[ReelShot] = Field(min_length=1, max_length=8)
    color: str = Field("#D8FB76", pattern=r"^#[a-fA-F0-9]{6}$")
    narration_asset_id: str | None = None


class ComposeReel(Model):
    expected_revision: int = Field(ge=1)
    narration_task_id: str
    beats: list[ReelBeat] = Field(min_length=1, max_length=12)
    music_asset_id: str | None = None
    series_title: str = Field("NEXT UP / AFTER DARK", max_length=100)
    profile: OutputProfile = Field(default_factory=OutputProfile)
    caption_style: Literal["boxed", "bold", "minimal", "editorial"] = "boxed"
    template: Literal["showcase-v1", "gameplay-v1"] = "showcase-v1"
    hook_max_ms: int | None = Field(
        None,
        ge=1000,
        le=30_000,
        description="Optional editorial speech limit. Null fits real narration without a hard three-second cap.",
    )
    show_titles: bool = True
    disclosure_text: str = Field(
        "",
        max_length=150,
        description="Optional explicitly authored footer. No automatic AI footer; required publication disclosures are handled separately.",
    )
    dry_run: bool = True
    replace_existing: bool = Field(
        False,
        description="Explicitly replace all existing tracks. Defaults to requiring an empty project. All writes remain revision-guarded and undoable.",
    )


class CompositionResult(Model):
    committed: bool
    base_revision: int
    project: ProjectSnapshot
    layout: LayoutReport
    warnings: list[str]


class SteamSearch(Model):
    query: str = Field(
        "",
        max_length=150,
        description="Steam text search, not a genre filter. Use tag_ids for genres (Open World=1695). Empty searches the whole catalog.",
    )
    sort: Literal["relevance", "release_date", "most_wishlisted", "popular"] = "relevance"
    coming_soon: bool = False
    tag_ids: list[Annotated[int, Field(gt=0)]] = Field(default_factory=list, max_length=10)
    count: int = Field(10, ge=1, le=20)
    start: int = Field(0, ge=0, le=1000)

    @model_validator(mode="after")
    def supported_filters(self):
        if self.sort == "popular" and self.coming_soon:
            raise ValueError(
                "Use most_wishlisted for upcoming popularity; Steam Top Sellers and Coming Soon are separate storefront lists"
            )
        return self


class SteamGames(Model):
    app_ids: list[int] = Field(min_length=1, max_length=10)


class SteamMovie(Model):
    id: int
    name: str
    thumbnail: str | None = None
    hls_url: str | None = None
    mp4_url: str | None = None
    webm_url: str | None = None


class SteamGame(Model):
    app_id: int
    name: str
    url: str
    fetched_at: str
    metadata_sha256: str
    release_date: str
    coming_soon: bool
    description: str
    developers: list[str]
    publishers: list[str]
    categories: list[str]
    genres: list[str]
    movies: list[SteamMovie]


class WaitRequest(Model):
    timeout_seconds: int = Field(
        20,
        ge=0,
        le=60,
        description="Bounded server-side wait for terminal state; returns current status on timeout, never claims completion.",
    )


class VerificationReport(Model):
    report_version: Literal[1] = 1
    job_id: str
    project_id: str
    revision: int
    from_ms: int
    to_ms: int
    decode_passed: bool
    sha256: str
    audio_pcm_hash: str | None
    metadata: dict[str, Any] = Field(
        description="Raw measured FFprobe format and streams; codec-specific fields vary."
    )
    audio: AudioReport | None
    layout: LayoutReport
    layout_scope: str
    passed: bool = Field(
        description="Automated checks only. A completed task can have passed=false; always inspect warnings and final images."
    )
    transcript: Transcript | None = None
    visual_review_required: Literal[True] = True
    browser_playback_tested: Literal[False] = False


class TranscriberStatus(Model):
    model: str
    repository: str
    revision: str
    runtime_available: bool
    installed: bool
    english_only: bool
    license: str
    install_task: InstallTranscriber


class ProductionCapabilities(Model):
    version: Literal[1] = 1
    transcribers: list[TranscriberStatus]
    task_types: list[str]
    templates: list[dict[str, Any]]
    limits: dict[str, int]
    workflow: list[str]
    limits_notes: list[str]


class SteamCandidate(Model):
    app_id: int
    url: str
    name: str


class SteamSearchResult(Model):
    fetched_at: str
    source: str
    candidates: list[SteamCandidate]
    total_count: int | None
    next_start: int
    note: str
    sort: str
    coming_soon: bool


class ClipChange(Model):
    clip_id: str
    change: Literal["added", "removed", "updated"]
    fields: list[str] = Field(default_factory=list)


class RevisionComparison(Model):
    project_id: str
    before_revision: int
    after_revision: int
    clip_changes: list[ClipChange]
    track_changes: list[str]
    profile_unchanged: bool
    script_unchanged: bool
    audio_unchanged: bool
    text_unchanged: bool


ProductionTask.model_rebuild()
