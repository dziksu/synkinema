"""Cheap timeline diagnostics. Does not render, decode media or change stored state."""

import logging

from .renderer import validate_timeline
from .timeline import lane_overlaps

log = logging.getLogger(__name__)


def narration_link_issues(project):
    linked = {
        line.audio_asset_id
        for line in project.script_lines
        if line.audio_asset_id and line.text.strip() and line.audio_text and line.audio_text.strip()
    }
    return [
        {
            "code": "unlinked_narration",
            "message": "Narration must be attached to a script_lines entry with audio_asset_id, audio_source and the actual audio_text. Save these associations with update_project before exporting through MCP; plain script/scenes metadata is insufficient.",
            "track_id": track.id,
            "clip_id": clip.id,
            "asset_id": clip.asset_id,
        }
        for track in project.tracks
        if track.kind == "voiceover" and not track.muted
        for clip in track.clips
        if clip.asset_id and clip.asset_id not in linked
    ]


def preflight(service, project, *, require_script_audio=False):
    errors, warnings = [], []
    (errors if require_script_audio else warnings).extend(narration_link_issues(project))

    def issue(items, code, message, **context):
        items.append({"code": code, "message": message, **context})

    if not project.duration_ms:
        issue(errors, "empty_timeline", "Add clips before rendering.")
    try:
        validate_timeline(project)
    except ValueError:
        log.warning("Preflight timeline validation failed for project %s", project.id, exc_info=True)
        issue(
            errors, "timeline", "Timeline validation failed. Check video tracks, clip timing and transitions."
        )
    for track, left, right in lane_overlaps(project):
        issue(
            warnings,
            "legacy_lane_overlap",
            "Legacy clips share one track. Move them to separate tracks before changing their timing.",
            track_id=track.id,
            clip_id=right.id,
            from_ms=right.start_ms,
            to_ms=min(left.start_ms + left.duration_ms, right.start_ms + right.duration_ms),
        )
    referenced = set(project.asset_ids)
    for track in project.tracks:
        for clip in track.clips:
            context = {"track_id": track.id, "clip_id": clip.id}
            # Check each clip independently so one broken reference doesn't hide later errors.
            sample = project.model_copy(
                update={"tracks": [track.model_copy(update={"clips": [clip]})], "asset_ids": []}
            )
            try:
                service.validate_assets(sample)
            except (ValueError, KeyError):
                log.warning(
                    "Preflight clip validation failed for project %s, track %s, clip %s",
                    project.id,
                    track.id,
                    clip.id,
                    exc_info=True,
                )
                issue(
                    errors,
                    "clip",
                    "Clip validation failed. Check media references and clip settings.",
                    **context,
                )
            if clip.asset_id:
                referenced.add(clip.asset_id)
    for asset_id in sorted(referenced):
        try:
            asset = service.asset(asset_id)
            if not service.store.path(asset["path"]).is_file():
                issue(errors, "missing_media_file", "Source media file is missing.", asset_id=asset_id)
        except (ValueError, KeyError):
            log.warning(
                "Preflight asset validation failed for project %s, asset %s",
                project.id,
                asset_id,
                exc_info=True,
            )
            issue(errors, "asset", "Referenced asset is invalid or unavailable.", asset_id=asset_id)
    active = [t for t in project.tracks if not t.muted]
    audio = [c for t in active if t.kind in ("voiceover", "music", "sound", "ambient") for c in t.clips]
    visual = [c for t in active if t.kind in ("video", "overlay") for c in t.clips]
    if project.duration_ms and not audio:
        issue(
            warnings,
            "no_audio",
            "No active audio clips. Video source audio is silent until extract_audio adds an audio copy.",
        )
    if project.duration_ms and not visual:
        issue(
            warnings,
            "no_visual_media",
            "No active video/image clips; output uses the background and active text.",
        )
    audible_end = max((c.start_ms + c.duration_ms for t in active for c in t.clips), default=0)
    if project.duration_ms > audible_end:
        issue(
            warnings,
            "muted_tail",
            "Muted clips extend output beyond active content.",
            from_ms=audible_end,
            to_ms=project.duration_ms,
        )
    # Report base-track gaps, not inferred black pixels: overlays may cover them.
    for track in active:
        if track.kind != "video" or not track.clips:
            continue
        end = 0
        for clip in sorted(track.clips, key=lambda c: c.start_ms):
            if clip.start_ms > end:
                issue(
                    warnings,
                    "primary_video_gap",
                    "Gap in the primary video track; other layers may cover it.",
                    track_id=track.id,
                    from_ms=end,
                    to_ms=clip.start_ms,
                )
            end = max(end, clip.start_ms + clip.duration_ms)
        if end < project.duration_ms:
            issue(
                warnings,
                "primary_video_gap",
                "Primary video ends before the timeline; other layers may cover it.",
                track_id=track.id,
                from_ms=end,
                to_ms=project.duration_ms,
            )
    return {
        "project_id": project.id,
        "revision": project.revision,
        "duration_ms": project.duration_ms,
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "track_count": len(project.tracks),
        "clip_count": sum(len(t.clips) for t in project.tracks),
        "asset_count": len(referenced),
        "requires_render_review": True,
    }
