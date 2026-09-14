"""Measured typography and source-preview sheets, without generating a timeline render."""

import hashlib
import json
import math

from PIL import Image, ImageDraw

from ..media import cached_text_layer, caption_bounds, font
from .contracts import LayoutReport, SourceSheet


def caption_layout(service, project):
    items, issues = [], []
    for track in project.tracks:
        if track.kind != "text" or track.muted:
            continue
        for clip in track.clips:
            path = cached_text_layer(
                clip, project.profile.width, project.profile.height, service.store.path("cache")
            )
            bounds = caption_bounds(path)
            with Image.open(path) as im:
                raw = json.loads(im.info.get("caption_unclipped_bounds", "null"))
            clipped = raw is not None and (
                raw["left"] < 0
                or raw["top"] < 0
                or raw["left"] + raw["width"] > project.profile.width
                or raw["top"] + raw["height"] > project.profile.height
            )
            items.append(
                {
                    "track_id": track.id,
                    "clip_id": clip.id,
                    "text": clip.text,
                    "start_ms": clip.start_ms,
                    "end_ms": clip.start_ms + clip.duration_ms,
                    "bounds": bounds,
                    "unclipped_bounds": raw,
                    "clipped": clipped,
                }
            )
            if clipped or not bounds:
                issues.append({"code": "caption_clipped" if clipped else "caption_empty", "clip_id": clip.id})
    for i, a in enumerate(items):
        for b in items[i + 1 :]:
            x, y = a["bounds"], b["bounds"]
            if a["start_ms"] >= b["end_ms"] or b["start_ms"] >= a["end_ms"] or not x or not y:
                continue
            if (
                x["left"] < y["left"] + y["width"]
                and y["left"] < x["left"] + x["width"]
                and x["top"] < y["top"] + y["height"]
                and y["top"] < x["top"] + x["height"]
            ):
                issues.append({"code": "caption_collision", "clip_ids": [a["clip_id"], b["clip_id"]]})
    return LayoutReport(revision=project.revision, passed=not issues, items=items, issues=issues)


async def inspect_source(service, request, run):
    asset = service.asset(request.asset_id)
    if asset["kind"] not in ("image", "video"):
        raise ValueError("Source frame inspection requires an image or video asset")
    end = request.to_ms or asset.get("duration_ms") or 1
    if asset["kind"] == "video" and (end > asset["duration_ms"] or end <= request.from_ms):
        raise ValueError("Source inspection interval is out of bounds")
    times = request.timestamps_ms or (
        [0]
        if asset["kind"] == "image"
        else [
            round(
                request.from_ms
                + (max(request.from_ms, end - 100) - request.from_ms) * i / max(1, request.count - 1)
            )
            for i in range(request.count)
        ]
    )
    if any(t < 0 or t >= end or t < request.from_ms for t in times):
        raise ValueError("Source timestamps must be inside the requested source interval")
    key = hashlib.sha256(json.dumps([asset["checksum"], times]).encode()).hexdigest()[:20]
    output = service.store.path(f"cache/{asset['id']}-source-{key}.jpg")
    if not output.exists():
        cols = min(4, len(times))
        w = 320
        h = round(w * asset["height"] / asset["width"])
        h = min(h, 570)
        sheet = Image.new("RGB", (cols * w, math.ceil(len(times) / cols) * (h + 30)), "#111616")
        d = ImageDraw.Draw(sheet)
        for i, t in enumerate(times):
            temp = service.store.path(f"cache/{asset['id']}-source-{key}-{i}.png")
            try:
                await run(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-protocol_whitelist",
                        "file,pipe",
                        "-threads",
                        "2",
                        "-ss",
                        str(t / 1000),
                        "-i",
                        str(service.store.path(asset["path"])),
                        "-frames:v",
                        "1",
                        "-vf",
                        f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
                        "-threads",
                        "2",
                        "-y",
                        str(temp),
                    ]
                )
                with Image.open(temp) as frame:
                    sheet.paste(frame, (i % cols * w, i // cols * (h + 30)))
                d.text(
                    (i % cols * w + 8, i // cols * (h + 30) + h + 4),
                    f"{t / 1000:.3f}s",
                    font=font(17),
                    fill="#d8fb76",
                )
            finally:
                temp.unlink(missing_ok=True)
        sheet.save(output, quality=90)
    with Image.open(output) as im:
        width, height = im.size
    return SourceSheet(
        asset_id=asset["id"],
        checksum=asset["checksum"],
        timestamps_ms=times,
        url=f"/media/cache/{output.name}",
        width=width,
        height=height,
    )
