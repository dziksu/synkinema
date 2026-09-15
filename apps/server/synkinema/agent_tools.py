"""Token-efficient MCP views and advisory editing plans; no alternate mutation path."""

import asyncio
from collections import Counter

from mcp.types import ToolAnnotations
from pydantic import Field, model_validator

from .models import BatchRequest, Model, Project, uid
from .service import Conflict
from .source_analysis import SourceAnalysis, SourceAnalysisRequest, silence_cut_segments


class ProjectBrowse(Model):
    query: str = Field(
        "", max_length=200, description="Case-insensitive project-name substring; empty matches all."
    )
    offset: int = Field(0, ge=0, description="Zero-based live result offset; use returned next_offset.")
    limit: int = Field(20, ge=1, le=50, description="Maximum compact project headers to return, 1–50.")


class EditContext(Model):
    project_id: str = Field(description="Exact project ID returned by Synkinema; never guess.")
    revision: int | None = Field(
        None,
        ge=1,
        description="Immutable revision to read; omit for current, then pin the returned revision across pages.",
    )
    track_ids: list[str] | None = Field(
        None, max_length=32, description="Optional exact track IDs from this project; omit for all tracks."
    )
    from_ms: int = Field(
        0, ge=0, description="Inclusive absolute project-timeline start in integer milliseconds."
    )
    to_ms: int | None = Field(
        None,
        gt=0,
        description="Exclusive absolute project-timeline end in integer milliseconds; omit for project end.",
    )
    offset: int = Field(
        0, ge=0, description="Zero-based offset within the filtered clip list; use returned next_offset."
    )
    limit: int = Field(40, ge=1, le=100, description="Maximum matching clips to return, 1–100.")

    @model_validator(mode="after")
    def interval(self):
        if self.to_ms is not None and self.to_ms <= self.from_ms:
            raise ValueError("to_ms must be greater than from_ms")
        return self


class WorkStatus(Model):
    job_ids: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Exact render job IDs already returned by Synkinema; never enqueue work merely to poll it.",
    )
    task_ids: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Exact production task IDs already returned by Synkinema; never enqueue work merely to poll it.",
    )
    wait_seconds: int = Field(
        0, ge=0, le=25, description="Wait until any selected work is terminal; never enqueue."
    )

    @model_validator(mode="after")
    def selection(self):
        if not 1 <= len(self.job_ids) + len(self.task_ids) <= 20:
            raise ValueError("Choose 1–20 exact job/task IDs")
        if len(set(self.job_ids)) != len(self.job_ids) or len(set(self.task_ids)) != len(self.task_ids):
            raise ValueError("IDs must be unique within each list")
        return self


class NarrationCut(Model):
    project_id: str = Field(description="Exact project ID containing the destination voiceover track.")
    expected_revision: int = Field(
        ge=1, description="Last confirmed current revision; stale plans reject and must be recomputed."
    )
    track_id: str = Field(description="Exact existing, unmuted voiceover track ID in this project.")
    asset_id: str = Field(description="Exact timed audio asset ID to measure and cut.")
    source_from_ms: int = Field(0, ge=0, description="Inclusive source-file offset in integer milliseconds.")
    source_to_ms: int | None = Field(
        None, gt=0, description="Exclusive source-file end in integer milliseconds; omit for asset end."
    )
    start_ms: int = Field(
        0, ge=0, le=86_400_000, description="Absolute project-timeline start for the first retained segment."
    )
    replace_clip_ids: list[str] = Field(
        default_factory=list,
        max_length=40,
        description="Only these exact clips on the voice track are removed by the proposed batch. Empty means append without deletion.",
    )
    silence_db: float = Field(-38, ge=-60, le=-20, description="FFmpeg silence threshold in dB.")
    silence_min_ms: int = Field(
        220, ge=100, le=2000, description="Minimum detected silence length in milliseconds."
    )
    leading_ms: int = Field(
        40, ge=0, le=1000, description="Silence retained before detected speech, in milliseconds."
    )
    trailing_ms: int = Field(
        200, ge=0, le=1000, description="Silence retained after detected speech, in milliseconds."
    )
    pause_ms: int = Field(
        120, ge=40, le=1000, description="Timeline pause inserted between retained segments, in milliseconds."
    )
    gain_db: float = Field(
        0, ge=-60, le=12, description="Gain applied to each proposed narration clip, in decibels."
    )


class EditAudit(Model):
    project_id: str = Field(description="Exact project ID to audit.")
    revision: int | None = Field(None, ge=1, description="Immutable revision to audit; omit for current.")
    max_shot_ms: int = Field(
        3000, ge=500, le=30_000, description="Visual clips longer than this heuristic threshold are flagged."
    )
    max_gap_ms: int = Field(
        350, ge=100, le=5000, description="Voiceover gaps at least this long are flagged, in milliseconds."
    )
    min_gameplay_height: float = Field(
        0.6, ge=0.1, le=1, description="Minimum expected gameplay-layer height as a fraction of canvas."
    )
    max_issues: int = Field(
        40,
        ge=1,
        le=100,
        description="Maximum ordered issue records to return; counts still report truncation.",
    )


def project_header(project):
    return {
        "id": project.id,
        "name": project.name,
        "channel_id": project.channel_id,
        "revision": project.revision,
        "duration_ms": project.duration_ms,
        "track_count": len(project.tracks),
        "clip_count": sum(len(t.clips) for t in project.tracks),
    }


def compact_batch(result):
    """Never label a dry-run candidate revision as a committed server revision."""
    return {
        "committed": result["committed"],
        "base_revision": result["base_revision"],
        "confirmed_revision": result["project"]["revision"]
        if result["committed"]
        else result["base_revision"],
        "applied_operations": result["applied_operations"],
        "project": project_header(
            Project.model_validate({k: v for k, v in result["project"].items() if k in Project.model_fields})
        ),
        "detail_tool": "get_edit_context",
    }


def browse_projects(service, request):
    # Read scalar names first, not timelines. Python casefold supports Polish/Unicode,
    # unlike SQLite lower()/NOCASE; punctuation is literal, not a SQL wildcard.
    names = service.store.rows(
        "SELECT id,json_extract(document, '$.name') AS name,updated_at FROM projects ORDER BY updated_at DESC,id"
    )
    matches = [r for r in names if request.query.casefold() in r["name"].casefold()]
    total = len(matches)
    rows = matches[request.offset : request.offset + request.limit]
    return {
        "items": [{**project_header(service.get(r["id"])), "updated_at": r["updated_at"]} for r in rows],
        "total": total,
        "offset": request.offset,
        "next_offset": request.offset + len(rows) if request.offset + len(rows) < total else None,
        "pagination": "Live index; concurrent updates may reorder pages. Pin a revision after selecting a project.",
    }


def edit_context(service, request):
    p = service.get(request.project_id, request.revision)
    known = {t.id for t in p.tracks}
    if request.track_ids is not None and set(request.track_ids) - known:
        raise ValueError("Unknown track_ids")
    clips = [
        (t.id, c)
        for t in p.tracks
        if request.track_ids is None or t.id in request.track_ids
        for c in t.clips
        if c.start_ms + c.duration_ms > request.from_ms
        and (request.to_ms is None or c.start_ms < request.to_ms)
    ]
    clips.sort(key=lambda pair: (pair[1].start_ms, pair[0], pair[1].id))
    page = clips[request.offset : request.offset + request.limit]
    assets = []
    for aid in sorted({c.asset_id for _, c in page if c.asset_id}):
        try:
            a = service.asset(aid)
            assets.append(
                {
                    k: a.get(k)
                    for k in ("id", "name", "kind", "duration_ms", "width", "height", "has_audio", "url")
                }
            )
        except KeyError:
            assets.append({"id": aid, "error": "missing_asset"})
    return {
        **project_header(p),
        "channel_context": service.channel_context(p.channel_id),
        "profile": p.profile.model_dump(),
        "tracks": [
            {
                "id": t.id,
                "name": t.name,
                "kind": t.kind,
                "muted": t.muted,
                "ducking": t.ducking,
                "clip_count": len(t.clips),
            }
            for t in p.tracks
        ],
        "clips": [
            {
                "track_id": tid,
                **c.model_dump(exclude_defaults=True),
                "id": c.id,
                "start_ms": c.start_ms,
                "duration_ms": c.duration_ms,
                "source_in_ms": c.source_in_ms,
            }
            for tid, c in page
        ],
        "assets": assets,
        "matching_clips": len(clips),
        "offset": request.offset,
        "next_offset": request.offset + len(page) if request.offset + len(page) < len(clips) else None,
        "omitted": "Clip model defaults; project brief/script/scenes. Not a full Project replacement. Use get_project for full nested edits; pin this revision for subsequent pages.",
    }


def work_item(document, kind):
    result = {k: document.get(k) for k in ("id", "status", "progress", "phase", "error")}
    result["kind"] = kind
    request = document.get("request", {})
    if kind == "render":
        result.update(project_id=document.get("project_id"), revision=document.get("revision"))
        result["output_url"] = document.get("output_url") if document["status"] == "completed" else None
        warnings = document.get("warnings", [])
        result["warning_counts"] = dict(Counter(w.get("code", "unknown") for w in warnings))
    else:
        result.update(
            type=request.get("type"),
            project_id=request.get("project_id"),
            request_key=document.get("request_key"),
        )
        body = document.get("result") or {}
        result["asset_ids"] = [a["id"] for a in body.get("assets", [])]
        result["narration"] = [
            {
                "id": n.get("id"),
                "asset_id": n.get("asset", {}).get("id"),
                "duration_ms": n.get("asset", {}).get("duration_ms"),
            }
            for n in body.get("narration", [])
        ]
        result["partial_results"] = document["status"] != "completed" and bool(
            result["asset_ids"] or result["narration"]
        )
        if v := body.get("verification"):
            audio, layout, transcript = v.get("audio") or {}, v.get("layout") or {}, v.get("transcript") or {}
            result["verification"] = {
                "job_id": v.get("job_id"),
                "revision": v.get("revision"),
                "passed": v.get("passed"),
                "decode_passed": v.get("decode_passed"),
                "integrated_lufs": audio.get("integrated_lufs"),
                "true_peak_dbtp": audio.get("true_peak_dbtp"),
                "audio_warnings": audio.get("warnings", []),
                "layout_passed": layout.get("passed"),
                "layout_issues": layout.get("issues", [])[:10],
                "layout_issue_count": len(layout.get("issues", [])),
                "match_ratio": transcript.get("match_ratio"),
                "speech_end_ms": transcript.get("speech_end_ms"),
                "transcript_warnings": transcript.get("warnings", []),
                "visual_review_required": v.get("visual_review_required", True),
                "browser_playback_tested": v.get("browser_playback_tested", False),
            }
        if d := body.get("delivery"):
            result["delivery"] = d
    return result


async def work_status(service, production, request):
    deadline = asyncio.get_running_loop().time() + request.wait_seconds
    while True:
        items = []
        for kind, ids in (("render", request.job_ids), ("production", request.task_ids)):
            for id in ids:
                try:
                    doc = service.store.job(id) if kind == "render" else production.get(id).model_dump()
                    items.append(work_item(doc, kind))
                except KeyError:
                    items.append(
                        {"id": id, "kind": kind, "status": "not_found", "error": "Work ID not found"}
                    )
        if (
            any(i["status"] in {"completed", "failed", "cancelled", "not_found"} for i in items)
            or asyncio.get_running_loop().time() >= deadline
        ):
            return {
                "items": items,
                "detail_tools": ["get_render_progress", "get_production_task"],
                "all_terminal": all(
                    i["status"] in {"completed", "failed", "cancelled", "not_found"} for i in items
                ),
            }
        await asyncio.sleep(min(0.5, max(0, deadline - asyncio.get_running_loop().time())))


def gaps(clips, end):
    cursor, result = 0, []
    for c in sorted(clips, key=lambda c: c.start_ms):
        if c.start_ms > cursor:
            result.append((cursor, c.start_ms))
        cursor = max(cursor, c.start_ms + c.duration_ms)
    if cursor < end:
        result.append((cursor, end))
    return result


def audit_edit(service, request):
    p = service.get(request.project_id, request.revision)
    preflight = service.preflight(p.id, p.revision)
    issues = [
        {"severity": level, **i}
        for level, key in (("error", "errors"), ("warning", "warnings"))
        for i in preflight[key]
    ]
    assets = {}
    active = [t for t in p.tracks if not t.muted]
    for t in active:
        for c in t.clips:
            if c.asset_id and c.asset_id not in assets:
                try:
                    assets[c.asset_id] = service.asset(c.asset_id)
                except KeyError:
                    assets[c.asset_id] = {}
            if t.kind not in ("video", "overlay") or not c.asset_id:
                continue
            context = {
                "severity": "warning",
                "track_id": t.id,
                "clip_id": c.id,
                "from_ms": c.start_ms,
                "to_ms": c.start_ms + c.duration_ms,
            }
            if c.duration_ms > request.max_shot_ms:
                issues.append(
                    {
                        **context,
                        "code": "long_visual_clip",
                        "message": "Long clip boundary interval; the source may already contain cuts. Inspect motion before editing.",
                    }
                )
            if assets[c.asset_id].get("kind") == "image" and c.duration_ms > request.max_shot_ms:
                issues.append(
                    {
                        **context,
                        "code": "static_image_source",
                        "message": "Image source, not gameplay motion. Transform animation does not create gameplay.",
                    }
                )
            if t.kind == "overlay" and c.placement.height < request.min_gameplay_height:
                issues.append(
                    {
                        **context,
                        "code": "small_visual_layer",
                        "message": "Visual layer is short relative to canvas. Intentional picture-in-picture may be fine.",
                        "height_fraction": c.placement.height,
                    }
                )
    voice = [c for t in active if t.kind == "voiceover" for c in t.clips]
    if voice:
        for start, end in gaps(voice, p.duration_ms):
            if end - start >= request.max_gap_ms:
                issues.append(
                    {
                        "severity": "warning",
                        "code": "voice_timeline_gap",
                        "from_ms": start,
                        "to_ms": end,
                        "message": "No voiceover clip here. This is timeline coverage, not measured source silence.",
                    }
                )
    samples = sorted({i.get("from_ms", 0) for i in issues if i.get("from_ms", 0) < p.duration_ms})[:24]
    return {
        "project_id": p.id,
        "revision": p.revision,
        "duration_ms": p.duration_ms,
        "structurally_valid": preflight["valid"],
        "issue_count": len(issues),
        "issues": issues[: request.max_issues],
        "truncated": len(issues) > request.max_issues,
        "suggested_timestamps_ms": samples,
        "requires_render_review": True,
        "limitations": "Short-form heuristics, not a quality score. Does not decode sources, judge hooks or claim black/silence. Use analyze_source_media and exact-job render_frames for evidence.",
    }


async def plan_narration_cut(service, analysis, request):
    p = service.get(request.project_id)
    if p.revision != request.expected_revision:
        raise Conflict(
            f"Expected revision {request.expected_revision}; current revision is {p.revision}. Reload before planning."
        )
    track = next((t for t in p.tracks if t.id == request.track_id), None)
    if track is None or track.kind != "voiceover" or track.muted:
        raise ValueError("Choose an existing unmuted voiceover track")
    if len(set(request.replace_clip_ids)) != len(request.replace_clip_ids) or set(
        request.replace_clip_ids
    ) - {c.id for c in track.clips}:
        raise ValueError("replace_clip_ids must be distinct existing clips on the selected voiceover track")
    measured = await analysis.analyze(
        SourceAnalysisRequest(
            asset_id=request.asset_id,
            from_ms=request.source_from_ms,
            to_ms=request.source_to_ms,
            mode="audio",
            silence_db=request.silence_db,
            silence_min_ms=request.silence_min_ms,
        )
    )
    segments = silence_cut_segments(
        measured["from_ms"],
        measured["to_ms"],
        measured["silence"],
        request.leading_ms,
        request.trailing_ms,
        request.pause_ms,
    )
    operations = [
        {"type": "remove_clip", "payload": {"track_id": track.id, "clip_id": id}}
        for id in request.replace_clip_ids
    ]
    for s in segments:
        s["start_ms"] += request.start_ms
        operations.append(
            {
                "type": "add_clip",
                "payload": {
                    "track_id": track.id,
                    "clip": {
                        "id": uid(),
                        "name": "Measured narration cut",
                        "asset_id": request.asset_id,
                        **s,
                        "gain_db": request.gain_db,
                        "fade_in_ms": 5,
                        "fade_out_ms": 5,
                    },
                },
            }
        )
    if len(operations) > 100:
        raise ValueError("Cut needs more than 100 operations; select a shorter narration range")
    batch = BatchRequest(expected_revision=p.revision, operations=operations, dry_run=True)
    candidate = service.batch(p.id, batch)  # Checks current revision again AFTER decoding; never saves.
    duration = sum(s["duration_ms"] for s in segments)
    return {
        "project_id": p.id,
        "confirmed_revision": p.revision,
        "committed": False,
        "source_duration_ms": measured["to_ms"] - measured["from_ms"],
        "narration_duration_ms": duration,
        "removed_ms": measured["to_ms"] - measured["from_ms"] - duration,
        "project_duration_ms_after": candidate["project"]["duration_ms"],
        "segments": segments,
        "request": batch.model_dump(),
        "warnings": [
            "Only selected voice clips change. Visuals, captions, music and later clips are NOT rippled; use segments to align them.",
            "Amplitude silence is not linguistic understanding. Audition the proposed cuts; breaths and quiet speech can fall below the threshold.",
        ],
        "next_step": "Review segments, then apply_operations(project_id, request with dry_run=false, compact=true). A conflict requires re-planning, not blind retry.",
    }


def register_agent_tools(mcp, service, inspection, production):
    read = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
    cache = ToolAnnotations(
        readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False
    )
    analysis = SourceAnalysis(service, inspection)

    @mcp.tool(name="browse_projects", annotations=read)
    def browse(request: ProjectBrowse) -> dict:
        """Prefer this compact, paginated project index over list_projects (full timelines). Filter names, return IDs/revisions/counts only. Use get_edit_context for selected clips or get_project for complete state."""
        return browse_projects(service, request)

    @mcp.tool(annotations=read)
    def get_edit_context(request: EditContext) -> dict:
        """Read a bounded page of clips with asset geometry, track inventory and confirmed revision. Defaults omitted, not a full replacement Project. Pin returned revision across pages; filter track_ids/time range before loading more. Full nested replacement edits still require get_project."""
        return edit_context(service, request)

    @mcp.tool(annotations=read)
    async def get_work_status(request: WorkStatus) -> dict:
        """Read/wait for up to 20 exact render/production IDs in one compact result. Optional wait_seconds <=25 ends when any is terminal; remove completed IDs before waiting again. Includes errors, artifact IDs and QA summary, not raw transcripts/PCM windows/snapshots. No enqueue/retry/cancellation."""
        return await work_status(service, production, request)

    @mcp.tool(annotations=cache)
    async def analyze_source_media(request: SourceAnalysisRequest) -> dict:
        """Measure imported source silence, black and frozen-frame candidates before rendering. Bounded <=120s range, 45s decode timeout, cached by source fingerprint/range/settings. Integer source-absolute milliseconds; visual sampling 8fps. Not gameplay recognition; inspect flagged frames. No network, media edits or project mutation."""
        return await analysis.analyze(request)

    @mcp.tool(name="plan_narration_cut", annotations=cache)
    async def plan_cut(request: NarrationCut) -> dict:
        """Measure actual voice silence and return a validated dry-run batch plus source-to-timeline segments. Only explicit replace_clip_ids on the selected voiceover track are replaced; no ripple of other tracks. Silence threshold is configurable; preview/audition before commit through apply_operations. Guarded expected_revision, no saved project changes."""
        return await plan_narration_cut(service, analysis, request)

    @mcp.tool(name="audit_edit", annotations=read)
    def audit(request: EditAudit) -> dict:
        """Cheap bounded short-form edit audit: preflight plus long clips, static-image sources, small visual overlays and voiceover coverage gaps. Exact clip IDs/times and suggested inspection points, no automatic fixes. Heuristics do not prove frozen/black pixels, source silence or quality; inspect and measure before editing."""
        return audit_edit(service, request)
