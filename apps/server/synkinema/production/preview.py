"""Short, content-addressed motion and audio excerpts of real imported sources."""

import hashlib
import json
import tempfile
from pathlib import Path

from ..media import probe
from .contracts import SourcePreview


async def preview_source(service, request, run):
    asset = service.asset(request.asset_id)
    if request.to_ms > (asset.get("duration_ms") or 0):
        raise ValueError("Preview interval exceeds source duration")
    if request.format == "wav":
        if not asset.get("has_audio"):
            raise ValueError("Source has no audio; silent imports cannot recover original sound")
    elif asset["kind"] != "video":
        raise ValueError("Motion preview requires video; use wav for narration/audio")
    key = hashlib.sha256(
        json.dumps(["preview-v1", asset["checksum"], request.model_dump()], sort_keys=True).encode()
    ).hexdigest()
    output = service.store.path(f"cache/{asset['id']}-source-preview-{key}.{request.format}")
    if not output.exists():
        with tempfile.TemporaryDirectory(prefix="source-preview-", dir=service.store.path("cache")) as work:
            target = Path(work) / output.name
            args = [
                "ffmpeg",
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-threads",
                "2",
                "-ss",
                str(request.from_ms / 1000),
                "-i",
                str(service.store.path(asset["path"])),
                "-t",
                str((request.to_ms - request.from_ms) / 1000),
            ]
            if request.format == "wav":
                args += ["-vn", "-map", "0:a:0", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le"]
            elif request.format == "gif":
                args += [
                    "-an",
                    "-vf",
                    "fps=10,scale=480:480:force_original_aspect_ratio=decrease",
                    "-loop",
                    "0",
                ]
            else:
                args += [
                    "-map",
                    "0:v:0",
                    "-vf",
                    "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "24",
                    "-movflags",
                    "+faststart",
                ]
                args += ["-map", "0:a:0?", "-c:a", "aac"] if request.include_audio else ["-an"]
            await run([*args, "-threads", "2", "-y", str(target)], timeout=60)
            probe(target)  # Never promote a failed encode into the cache.
            target.replace(output)
    metadata = probe(output)
    return SourcePreview(
        asset_id=asset["id"],
        checksum=asset["checksum"],
        from_ms=request.from_ms,
        to_ms=request.to_ms,
        duration_ms=metadata["duration_ms"],
        url=f"/media/cache/{output.name}",
        mime_type={"mp4": "video/mp4", "gif": "image/gif", "wav": "audio/wav"}[request.format],
        has_audio=bool(metadata.get("has_audio")),
    )
