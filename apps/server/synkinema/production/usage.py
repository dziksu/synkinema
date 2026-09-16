"""Source-time usage, derived from edits and frozen in manual publication records."""

import json
import math
import re

from pydantic import Field, model_validator

from ..models import Model, Project


class FootageUse(Model):
    project_id: str
    project_name: str
    revision: int
    asset_id: str
    checksum: str
    source_key: str
    app_id: int | None = None
    movie_id: int | None = None
    from_ms: int
    to_ms: int
    timeline_from_ms: int
    timeline_to_ms: int
    clip_ids: list[str]
    publication_id: str | None = None


class SourceUsageRequest(Model):
    channel_id: str | None = None
    asset_id: str | None = None
    app_id: int | None = Field(None, gt=0)
    exclude_project_id: str | None = None
    from_ms: int | None = Field(
        None, ge=0, description="Optional proposed asset-local interval; requires asset_id and to_ms."
    )
    to_ms: int | None = Field(None, gt=0)
    start: int = Field(0, ge=0)
    count: int = Field(50, ge=1, le=200)

    @model_validator(mode="after")
    def interval(self):
        if (self.from_ms is None) != (self.to_ms is None):
            raise ValueError("Supply both from_ms and to_ms")
        if self.from_ms is not None and (not self.asset_id or self.to_ms <= self.from_ms):
            raise ValueError("An overlap query requires asset_id and a nonempty source interval")
        return self


class SourceUsageResult(Model):
    uses: list[FootageUse]
    total_count: int
    next_start: int | None
    note: str = "Current unmuted video timelines plus frozen published source ranges. Crops/speed do not create fresh footage; simultaneous identical layers are grouped. Unknown provenance matches by checksum only. Multiple provenance records are conservative aliases. This does not detect visually similar re-encodes without shared provenance or prove playback/publication. Older publications without snapshots are not reconstructed."


def source_origins(service, asset):
    path = service.store.path(f"cache/{asset['id']}-provenance.json")
    records = json.loads(path.read_text()) if path.exists() else []
    records = records if isinstance(records, list) else [records]
    origins = set()
    for record in records:
        request = record.get("request", {})
        steam = record.get("steam") or {}
        app = steam.get("game", {}).get("app_id")
        match = re.search(r"\| movie (\d+):", request.get("source", ""))
        movie = steam.get("movie_id") or (int(match[1]) if match else None)
        key = f"steam:{app}:movie:{movie}" if app and movie else request.get("url")
        if key:
            origins.add((key, request.get("from_ms", 0), app, movie))
    return sorted(origins, key=str) or [(f"sha256:{asset['checksum']}", 0, None, None)]


def project_footage(service, project):
    grouped = {}
    assets = {}
    for track in project.tracks:
        if track.muted or track.kind not in ("video", "overlay"):
            continue
        for clip in track.clips:
            if not clip.asset_id:
                continue
            if clip.asset_id not in assets:
                assets[clip.asset_id] = service.asset(clip.asset_id)
            asset = assets[clip.asset_id]
            if asset["kind"] != "video":
                continue
            for key, offset, app, movie in source_origins(service, asset):
                start = offset + clip.source_in_ms
                end = start + math.ceil(clip.duration_ms * clip.speed)
                identity = (key, start, end, clip.start_ms, clip.start_ms + clip.duration_ms)
                if identity in grouped:
                    grouped[identity].clip_ids.append(clip.id)
                else:
                    grouped[identity] = FootageUse(
                        project_id=project.id,
                        project_name=project.name,
                        revision=project.revision,
                        asset_id=asset["id"],
                        checksum=asset["checksum"],
                        source_key=key,
                        app_id=app,
                        movie_id=movie,
                        from_ms=start,
                        to_ms=end,
                        timeline_from_ms=clip.start_ms,
                        timeline_to_ms=clip.start_ms + clip.duration_ms,
                        clip_ids=[clip.id],
                    )
    return list(grouped.values())


def source_usage(service, request):
    if request.channel_id:
        service.channel(request.channel_id)
    origins = None
    if request.asset_id:
        asset = service.asset(request.asset_id)
        if request.to_ms is not None and request.to_ms > (asset.get("duration_ms") or 0):
            raise ValueError("Proposed source interval exceeds asset duration")
        origins = source_origins(service, asset)
    uses = []
    for row in service.store.rows("SELECT document FROM projects ORDER BY id"):
        project = Project.model_validate_json(row["document"])
        if request.channel_id and project.channel_id != request.channel_id:
            continue
        if project.id != request.exclude_project_id:
            uses.extend(project_footage(service, project))
    for row in service.store.rows(
        "SELECT channel_id,document FROM channel_records WHERE kind='publication' ORDER BY id"
    ):
        if request.channel_id and row["channel_id"] != request.channel_id:
            continue
        publication = json.loads(row["document"])
        if publication.get("status") != "published":
            continue
        uses.extend(
            FootageUse.model_validate({**use, "publication_id": publication["id"]})
            for use in publication.get("source_usage", [])
        )
    selected = []
    for use in uses:
        if use.project_id == request.exclude_project_id or (request.app_id and use.app_id != request.app_id):
            continue
        if origins is not None:
            matching = [(key, offset) for key, offset, _, _ in origins if key == use.source_key]
            if not matching:
                continue
            if request.from_ms is not None and not any(
                use.from_ms < offset + request.to_ms and use.to_ms > offset + request.from_ms
                for _, offset in matching
            ):
                continue
        selected.append(use)
    end = request.start + request.count
    return SourceUsageResult(
        uses=selected[request.start : end],
        total_count=len(selected),
        next_start=end if end < len(selected) else None,
    )
