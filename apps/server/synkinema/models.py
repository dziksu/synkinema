from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

ANIMATION_BOUNDS = {"scale": (1, 4), "x": (0, 1), "y": (0, 1), "opacity": (0, 1), "gain_db": (-60, 12)}
EFFECT_BOUNDS = {
    "blur": (0, 30),
    "brightness": (-1, 1),
    "contrast": (0, 3),
    "saturation": (0, 3),
    "grayscale": (0, 1),
    "vignette": (0, 1),
    "sharpen": (0, 3),
}


def uid() -> str:
    return uuid4().hex


class Model(BaseModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, json_schema_serialization_defaults_required=True
    )


class OutputProfile(Model):
    name: str = "Instagram Reel"
    kind: Literal["reel", "short", "video", "square", "custom"] = "reel"
    width: int = Field(1080, ge=128, le=3840, multiple_of=2)
    height: int = Field(1920, ge=128, le=3840, multiple_of=2)
    fps: int = Field(30, ge=12, le=60)
    crf: int = Field(
        18,
        ge=15,
        le=35,
        description="H.264 constant quality: lower is better/larger. 18 high, 20 balanced, 23 compact.",
    )
    target_lufs: float = Field(-16, ge=-30, le=-10)
    true_peak: float = Field(-1.5, ge=-6, le=-1)
    normalize: bool = True


class Keyframe(Model):
    time_ms: int = Field(
        ge=0,
        description="Clip-local keyframe time in milliseconds, not absolute timeline time; must not exceed clip duration.",
    )
    value: float
    easing: Literal["linear", "ease_in", "ease_out", "ease_in_out"] = "linear"


class Animation(Model):
    property: Literal["scale", "x", "y", "opacity", "gain_db"]
    keyframes: list[Keyframe] = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def ordered(self):
        times = [k.time_ms for k in self.keyframes]
        if times != sorted(set(times)):
            raise ValueError("Keyframe times must be unique and increasing")
        low, high = ANIMATION_BOUNDS[self.property]
        if any(not low <= k.value <= high for k in self.keyframes):
            raise ValueError(f"{self.property} keyframes must be within {low}..{high}")
        return self


class Transform(Model):
    scale: float = Field(1, ge=1, le=4)
    x: float = Field(0.5, ge=0, le=1)
    y: float = Field(0.5, ge=0, le=1)
    rotation: float = Field(0, ge=-180, le=180)
    opacity: float = Field(1, ge=0, le=1)
    fit: Literal["cover", "contain"] = "cover"


class Placement(Model):
    """Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors."""

    x: float = Field(0.5, ge=0, le=1)
    y: float = Field(0.5, ge=0, le=1)
    width: float = Field(1, ge=0.05, le=2)
    height: float = Field(1, ge=0.05, le=2)


class Effect(Model):
    type: Literal["blur", "brightness", "contrast", "saturation", "grayscale", "vignette", "sharpen"]
    value: float = 1
    enabled: bool = True

    @model_validator(mode="after")
    def bounds(self):
        low, high = EFFECT_BOUNDS[self.type]
        if not low <= self.value <= high:
            raise ValueError(f"{self.type} must be within {low}..{high}")
        return self


class Transition(Model):
    type: Literal["cut", "crossfade", "fade_black", "slide", "wipe", "zoom", "blur"] = "cut"
    duration_ms: int = Field(300, ge=0, le=2000)


class Clip(Model):
    id: str = Field(default_factory=uid)
    name: str = Field("Untitled clip", max_length=300)
    asset_id: str | None = None
    start_ms: int = Field(
        0, ge=0, le=86_400_000, description="Absolute start on project timeline, in integer milliseconds."
    )
    duration_ms: int = Field(4000, ge=100, le=86_400_000)
    source_in_ms: int = Field(
        0,
        ge=0,
        description="Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.",
    )
    speed: float = Field(1, ge=0.25, le=4)
    gain_db: float = Field(0, ge=-60, le=12)
    fade_in_ms: int = Field(0, ge=0, le=10000)
    fade_out_ms: int = Field(0, ge=0, le=10000)
    transform: Transform = Field(default_factory=Transform)
    placement: Placement = Field(default_factory=Placement)
    shape: Literal["rectangle", "ellipse", "line"] | None = Field(
        None,
        description="Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.",
    )
    caption_style: Literal["editorial", "bold", "boxed", "minimal"] = "editorial"
    text_x: float = Field(
        0.09, ge=0, le=0.9, description="Left edge of caption block as fraction of output width."
    )
    effects: list[Effect] = Field(default_factory=list, max_length=16)
    animations: list[Animation] = Field(default_factory=list, max_length=5)
    transition: Transition = Field(default_factory=Transition)
    text: str = Field("", max_length=2000)
    subtitle: str = Field("", max_length=2000)
    color: str = Field("#d8fb76", pattern=r"^#[0-9a-fA-F]{6}$")
    font_size: int = Field(80, ge=16, le=200)
    text_y: float = Field(0.66, ge=0.1, le=0.85)

    @model_validator(mode="after")
    def valid_times(self):
        if self.transition.duration_ms >= self.duration_ms and self.transition.type != "cut":
            raise ValueError("Transition must be shorter than clip")
        if self.fade_in_ms > self.duration_ms or self.fade_out_ms > self.duration_ms:
            raise ValueError("Fade must fit inside clip")
        if len({a.property for a in self.animations}) != len(self.animations):
            raise ValueError("Only one animation per property")
        if any(k.time_ms > self.duration_ms for a in self.animations for k in a.keyframes):
            raise ValueError("Keyframe outside clip")
        return self


class Track(Model):
    id: str = Field(default_factory=uid)
    name: str
    kind: Literal["video", "overlay", "text", "voiceover", "music", "sound", "ambient"]
    muted: bool = False
    ducking: bool = False
    gain_db: float = Field(
        0,
        ge=-60,
        le=12,
        description="Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.",
    )
    clips: list[Clip] = Field(default_factory=list, max_length=500)


class Scene(Model):
    id: str = Field(default_factory=uid)
    title: str
    narration: str = ""
    notes: str = ""
    start_ms: int = Field(0, ge=0)
    duration_ms: int = Field(4000, ge=100)
    voice_asset_id: str | None = None


class ScriptLine(Model):
    id: str = Field(
        min_length=1, max_length=100, description="Stable line identity across edits and reordering."
    )
    text: str = Field("", max_length=100000)
    audio_asset_id: str | None = Field(
        None, min_length=1, description="Server-validated audio asset; no automatic timeline insertion."
    )
    audio_text: str | None = Field(
        None,
        max_length=100000,
        description="Text at recording/upload/generation time. A mismatch with text means the take may be outdated.",
    )
    audio_source: Literal["recorded", "uploaded", "generated"] | None = None

    @model_validator(mode="after")
    def audio_reference(self):
        if (self.audio_asset_id is not None) != (
            self.audio_text is not None and self.audio_source is not None
        ):
            raise ValueError("Line audio requires an asset, source and text snapshot together")
        if self.audio_asset_id is None and (self.audio_text is not None or self.audio_source is not None):
            raise ValueError("Audio metadata requires an asset")
        return self


class Project(Model):
    id: str = Field(default_factory=uid)
    channel_id: str | None = Field(
        None,
        description="Optional local editorial channel ID. Null means independent. Link/unlink via update_project with expected_revision; no media or timeline changes.",
    )
    name: str = Field(min_length=1, max_length=200)
    brief: str = Field("", max_length=20000)
    script: str = Field("", max_length=100000)
    script_lines: list[ScriptLine] = Field(
        default_factory=list,
        max_length=500,
        description="Ordered narration lines and optional audio takes. Empty for legacy plain-text scripts. When supplied to update_project, replaces the list and synchronizes script with newline-joined text. A changed script-only edit clears these associations. Replacing an existing line take also replaces its unambiguous whole-take voiceover clips and scene voice references, preserving starts/speed/gain; measured duration changes must fit the lane. Trimmed/split or shared-line takes require explicit clip edits in the same batch.",
    )
    revision: int = Field(1, ge=1)
    profile: OutputProfile = Field(default_factory=OutputProfile)
    scenes: list[Scene] = Field(default_factory=list, max_length=500)
    tracks: list[Track] = Field(
        default_factory=lambda: [
            Track(id="video", name="Video", kind="video"),
            Track(id="titles", name="Captions", kind="text"),
            Track(id="voice", name="Voiceover", kind="voiceover"),
            Track(id="music", name="Music", kind="music", ducking=True),
        ],
        max_length=32,
    )
    asset_ids: list[str] = Field(default_factory=list)

    @property
    def duration_ms(self):
        return max((c.start_ms + c.duration_ms for t in self.tracks for c in t.clips), default=0)

    @model_validator(mode="after")
    def identities(self):
        if len({line.id for line in self.script_lines}) != len(self.script_lines):
            raise ValueError("Script line IDs must be unique")
        if self.script_lines:
            self.script = "\n".join(line.text for line in self.script_lines)
            if len(self.script) > 100000:
                raise ValueError("Maximum script length is 100000 characters")
        ids = [t.id for t in self.tracks] + [c.id for t in self.tracks for c in t.clips]
        if len(ids) != len(set(ids)):
            raise ValueError("Track and clip IDs must be unique")
        if sum(len(t.clips) for t in self.tracks) > 1000:
            raise ValueError("Maximum 1000 clips")
        if self.duration_ms > 86_400_000:
            raise ValueError("Maximum duration is 24 hours")
        return self


class EditStep(Model):
    type: Literal[
        "update_project",
        "add_track",
        "reorder_tracks",
        "remove_track",
        "trim_clip",
        "update_track",
        "add_clip",
        "append_clip",
        "duplicate_clip",
        "extract_audio",
        "update_clip",
        "move_clip",
        "set_transition",
        "split_clip",
        "remove_clip",
        "restore_revision",
    ] = Field(
        description="Exact supported operation name. Read get_operation_reference(operation=type) before constructing payload."
    )
    payload: dict = Field(
        description="Operation-specific object. Call get_operation_reference(operation=type) or GET /api/schema/operations?operation=TYPE for exact schema, example and side effects; there is no generic changes schema for all operations."
    )


class Operation(EditStep):
    expected_revision: int = Field(
        ge=1,
        description="Current project revision from get_project or previous edit response. Serialize writes; stale revisions reject atomically.",
    )


class BatchRequest(Model):
    expected_revision: int = Field(
        ge=1,
        description="Last confirmed project revision. The entire batch rejects atomically when stale.",
    )
    operations: list[EditStep] = Field(
        min_length=1,
        max_length=100,
        description="Ordered editing operations committed as one revision; later steps see earlier steps in this list.",
    )
    dry_run: bool = Field(
        False,
        description="Validate and return a candidate without saving. Generated IDs are provisional; a later commit generates new IDs unless supplied explicitly.",
    )


class CloneRequest(Model):
    name: str = Field(min_length=1, max_length=200)
    revision: int = Field(
        ge=1, description="Exact source revision to copy. Source stays unchanged; assets are shared."
    )


class ExportOutput(Model):
    width: int = Field(
        ge=2,
        le=3840,
        multiple_of=2,
        description="Encoded frame width in pixels, even; not the editor canvas width.",
        examples=[1920, 3840],
    )
    height: int = Field(
        ge=2,
        le=3840,
        multiple_of=2,
        description="Encoded frame height in pixels, even.",
        examples=[1080, 2160],
    )
    fps: int = Field(
        30,
        ge=12,
        le=60,
        description="Output frames per second. Increasing FPS repeats source frames; no motion interpolation.",
    )
    crf: int = Field(
        18,
        ge=15,
        le=35,
        description="H.264 constant quality; 15 maximum, 18 high, 20 balanced, 23 compact. Bitrate/file size depend on content.",
    )
    fit: Literal["contain", "cover"] = Field(
        "contain",
        description="Adapt the ENTIRE composition, including captions: contain preserves it with bars, cover crops it without distortion. Does not rearrange clips.",
    )
    background: str = Field(
        "#080e10", pattern=r"^#[0-9a-fA-F]{6}$", description="Letterbox color for contain."
    )
    x: float = Field(
        0.5, ge=0, le=1, description="Horizontal crop/padding alignment: 0 left, 0.5 center, 1 right."
    )
    y: float = Field(
        0.5, ge=0, le=1, description="Vertical crop/padding alignment: 0 top, 0.5 center, 1 bottom."
    )


class RenderRequest(Model):
    expected_revision: int | None = None
    quality: Literal["preview", "final"] = "final"
    from_ms: int = Field(0, ge=0)
    to_ms: int | None = Field(None, gt=0)
    output: ExportOutput | None = Field(
        None,
        description="Optional export-only settings; project profile, clips and revision stay unchanged. Omit to use the project profile. Preview applies this framing but caps its longest edge at 640 px and uses CRF 27. Discover /api/export-presets.",
    )


class AssetLocation(Model):
    project_id: str | None = Field(
        None, description="Omit for shared library; set to a project ID for its private media collection."
    )
    folder_id: str | None = Field(
        None,
        description="Folder in the selected collection, or null for its root. Adds or moves membership without copying media or changing timeline revisions.",
    )


class FolderRename(Model):
    name: str = Field(min_length=1, max_length=100)


class FolderRequest(FolderRename):
    project_id: str | None = None
