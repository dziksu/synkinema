"""Shared export geometry/catalog for REST, MCP and the renderer; never edits a project."""

from typing import Literal

from pydantic import Field

from .models import ExportOutput, Model, Project


class ExportPreset(Model):
    id: str
    name: str
    aspect: str
    resolution: str
    width: int
    height: int
    kind: Literal["video", "reel", "square", "custom"]


class EncodingQuality(Model):
    id: str
    name: str
    crf: int


class ExportCatalog(Model):
    presets: list[ExportPreset]
    qualities: list[EncodingQuality]
    frame_rates: list[int]
    preview_max_edge: int = 640
    default_crf: int = 18


class ExportWarning(Model):
    code: str
    message: str
    asset_id: str | None = None
    clip_id: str | None = None


class ExportPlan(Model):
    project_id: str
    revision: int
    output: ExportOutput
    canvas_width: int
    canvas_height: int
    warnings: list[ExportWarning] = Field(default_factory=list)


def export_catalog():
    presets = []
    for aspect, name, kind in [
        ("16:9", "Landscape", "video"),
        ("9:16", "Reel / Short", "reel"),
        ("1:1", "Square", "square"),
        ("4:5", "Portrait feed", "custom"),
    ]:
        for edge, label in [
            (720, "HD · 720p"),
            (1080, "Full HD · 1080p"),
            (1440, "QHD · 1440p (2K)"),
            (2160, "4K UHD · 2160p"),
        ]:
            width, height = {
                "16:9": (edge * 16 // 9, edge),
                "9:16": (edge, edge * 16 // 9),
                "1:1": (edge, edge),
                "4:5": (edge, edge * 5 // 4),
            }[aspect]
            presets.append(
                ExportPreset(
                    id=f"{kind}-{edge}",
                    name=name,
                    aspect=aspect,
                    resolution=label if aspect in ("16:9", "9:16") else f"{edge} px",
                    width=width,
                    height=height,
                    kind=kind,
                )
            )
    return ExportCatalog(
        presets=presets,
        qualities=[
            EncodingQuality(id=id, name=name, crf=crf)
            for id, name, crf in [
                ("high", "High quality", 18),
                ("maximum", "Maximum quality", 15),
                ("balanced", "Balanced", 20),
                ("compact", "Smaller file", 23),
            ]
        ],
        frame_rates=[24, 25, 30, 50, 60],
    )


def resolved_output(project, output=None, quality="final"):
    target = (
        ExportOutput.model_validate(output)
        if output is not None
        else ExportOutput(**{k: getattr(project.profile, k) for k in ("width", "height", "fps", "crf")})
    )
    if quality == "preview":
        ratio = min(1, 640 / max(target.width, target.height))
        target = target.model_copy(
            update={
                "width": max(2, round(target.width * ratio / 2) * 2),
                "height": max(2, round(target.height * ratio / 2) * 2),
                "crf": 27,
            }
        )
    return target


def composition_profile(project, target):
    # Preserve composition geometry and caption line breaks. Limit intermediate
    # canvases to 3840 on either edge even for extreme aspect conversions.
    p = project.profile.model_copy()
    ratios = (target.width / p.width, target.height / p.height)
    factor = (min if target.fit == "contain" else max)(ratios)
    factor = min(factor, 3840 / max(p.width, p.height))
    p.width = max(2, round(p.width * factor / 2) * 2)
    p.height = max(2, round(p.height * factor / 2) * 2)
    p.fps, p.crf = target.fps, target.crf
    return p


def framing_filter(target):
    w, h = target.width, target.height
    if target.fit == "cover":
        # Crop before upscaling: a portrait -> landscape 4K conversion must not
        # allocate a 3840x6826 scaled frame merely to discard most of it.
        return f"crop=w='min(iw,ih*{w}/{h})':h='min(ih,iw*{h}/{w})':x='(iw-ow)*{target.x}':y='(ih-oh)*{target.y}',scale={w}:{h}:flags=lanczos,setsar=1"
    return f"scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad={w}:{h}:(ow-iw)*{target.x}:(oh-ih)*{target.y}:color={target.background},setsar=1"


def export_plan(service, project: Project, output=None, quality="final"):
    target = resolved_output(project, output, quality)
    canvas = composition_profile(project, target)
    warnings = []
    if quality == "preview":
        warnings.append(
            ExportWarning(
                code="draft_quality",
                message="Draft preview is limited to 640 px and CRF 27. Use Final video to assess delivery quality.",
            )
        )
    if (
        target.fit == "cover"
        and abs(project.profile.width / project.profile.height - target.width / target.height) > 0.01
    ):
        warnings.append(
            ExportWarning(
                code="composition_crop",
                message="Fill crops the whole composition, including captions and graphics. Check the framing preview before exporting.",
            )
        )
    for track in project.tracks:
        if track.muted or track.kind not in ("video", "overlay"):
            continue
        for clip in track.clips:
            if not clip.asset_id or clip.shape:
                continue
            asset = service.asset(clip.asset_id)
            sw, sh = asset.get("width"), asset.get("height")
            if not sw or not sh:
                continue
            # Estimate source enlargement in final pixels, including crop zoom
            # and animated zoom maxima. Resolution alone is not a quality score.
            ratio = (min if target.fit == "contain" else max)(
                target.width / project.profile.width, target.height / project.profile.height
            )
            bw = project.profile.width * ratio * clip.placement.width
            bh = project.profile.height * ratio * clip.placement.height
            zoom = max(
                [
                    clip.transform.scale,
                    *[k.value for a in clip.animations if a.property == "scale" for k in a.keyframes],
                ]
            )
            enlargement = (max if clip.transform.fit == "cover" else min)(bw / sw, bh / sh) * zoom
            if enlargement > 1.05:
                warnings.append(
                    ExportWarning(
                        code="source_upscale",
                        message=f"{asset['name']}: {sw} × {sh} source enlarged about {enlargement:.1f}× in '{clip.name}'. Higher output resolution cannot restore missing source detail.",
                        asset_id=clip.asset_id,
                        clip_id=clip.id,
                    )
                )
    return ExportPlan(
        project_id=project.id,
        revision=project.revision,
        output=target,
        canvas_width=canvas.width,
        canvas_height=canvas.height,
        warnings=warnings,
    )
