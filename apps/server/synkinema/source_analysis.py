"""Bounded, cached source measurements. No TTS, network, edits or render enqueue."""

import asyncio
import hashlib
import json
import re
from typing import Literal

from pydantic import Field, model_validator

from .models import Model
from .renderer import Renderer

ANALYSIS_VERSION = 1


class SourceAnalysisRequest(Model):
    asset_id: str = Field(description="Exact imported video/audio asset ID returned by Synkinema.")
    from_ms: int = Field(0, ge=0, description="Inclusive source-file start in integer milliseconds.")
    to_ms: int | None = Field(None, gt=0, description="Exclusive source end; maximum range 120 seconds.")
    mode: Literal["audio", "video", "both"] = Field(
        "both", description="Streams to measure. The selected asset must contain each requested stream."
    )
    silence_db: float = Field(-38, ge=-60, le=-20, description="FFmpeg silence threshold in dB.")
    silence_min_ms: int = Field(200, ge=100, le=2000, description="Minimum silence interval in milliseconds.")
    visual_min_ms: int = Field(
        700, ge=250, le=5000, description="Minimum black/frozen visual interval in milliseconds."
    )

    @model_validator(mode="after")
    def interval(self):
        if self.to_ms is not None and not 0 < self.to_ms - self.from_ms <= 120_000:
            raise ValueError("Choose a nonempty source range of at most 120 seconds")
        return self


def intervals(log, prefix, start, end):
    """FFmpeg timestamps are relative to the sought input; close trailing events at EOF."""
    opened, result = None, []
    for event, value in re.findall(rf"{prefix}_(start|end):\s*([\d.eE+-]+)", log):
        ms = max(start, min(end, start + round(float(value) * 1000)))
        if event == "start":
            opened = ms
        elif opened is not None:
            if ms > opened:
                result.append({"from_ms": opened, "to_ms": ms})
            opened = None
    if opened is not None and end > opened:
        result.append({"from_ms": opened, "to_ms": end})
    return result


class SourceAnalysis:
    def __init__(self, service, inspection):
        self.service, self.inspection = service, inspection
        self.lock = asyncio.Lock()

    async def analyze(self, request: SourceAnalysisRequest):
        # Serialize decoding, and exclude concurrent deletion of the source/cache.
        async with self.lock, self.inspection.lifecycle:
            asset = self.service.asset(request.asset_id)
            if asset["kind"] not in ("video", "audio"):
                raise ValueError("A timed video/audio source is required; images are static by definition")
            end = request.to_ms if request.to_ms is not None else asset.get("duration_ms")
            if not end or not 0 < end - request.from_ms <= 120_000 or end > asset["duration_ms"]:
                raise ValueError("Source range must be in bounds and at most 120 seconds")
            audio = request.mode in ("audio", "both") and asset.get("has_audio", False)
            video = request.mode in ("video", "both") and asset["kind"] == "video"
            if not audio and not video:
                raise ValueError("Requested stream is unavailable; inspect asset kind/has_audio")
            path = self.service.store.path(asset["path"])
            stat = path.stat()  # Missing source is never concealed by a cached success.
            identity = [
                ANALYSIS_VERSION,
                asset["checksum"],
                stat.st_size,
                stat.st_mtime_ns,
                request.model_dump(),
            ]
            digest = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:24]
            cache = self.service.store.path(f"cache/source-analysis-{digest}.json")
            if cache.exists():
                return {**json.loads(cache.read_text()), "cached": True}
            args = [
                "-loglevel",
                "info",
                "-protocol_whitelist",
                "file,pipe",
                "-ss",
                str(request.from_ms / 1000),
                "-i",
                str(path),
                "-t",
                str((end - request.from_ms) / 1000),
            ]
            if audio:
                args += [
                    "-map",
                    "0:a:0",
                    "-af",
                    f"silencedetect=n={request.silence_db}dB:d={request.silence_min_ms / 1000}",
                ]
            else:
                args += ["-an"]
            if video:
                args += [
                    "-map",
                    "0:v:0",
                    "-vf",
                    (
                        f"fps=8,scale=320:-2,blackdetect=d={request.visual_min_ms / 1000}:pix_th=0.10:pic_th=0.98,"
                        f"freezedetect=n=-50dB:d={request.visual_min_ms / 1000}"
                    ),
                ]
            else:
                args += ["-vn"]
            args += ["-f", "null", "-"]
            log = await asyncio.wait_for(Renderer(self.service).run(args), timeout=45)
            if len(log.encode()) >= 60_000:
                raise ValueError("Too many detection events for a complete report; choose a shorter range")
            result = {
                "analysis_version": ANALYSIS_VERSION,
                "asset_id": asset["id"],
                "from_ms": request.from_ms,
                "to_ms": end,
                "cached": False,
                "audio_analyzed": bool(audio),
                "video_analyzed": video,
                "silence": intervals(log, "silence", request.from_ms, end) if audio else None,
                "black": intervals(log, "black", request.from_ms, end) if video else None,
                "freeze": intervals(log, "freeze", request.from_ms, end) if video else None,
                "visual_sample_fps": 8 if video else None,
                "review_required": True,
                "limitations": "Threshold-based candidates, not speech recognition or gameplay classification. Visual timing is sampled at 8 fps; dark/still artistic shots may be intentional. Inspect source frames before cutting.",
            }
            temp = cache.with_suffix(".partial")
            temp.write_text(json.dumps(result))
            temp.replace(cache)
            return result


def silence_cut_segments(start, end, silence, leading_ms=40, trailing_ms=200, pause_ms=120):
    """Keep speech intact, remove only the middle of measured silence intervals."""
    removed = []
    for gap in silence:
        a, b = max(start, gap["from_ms"]), min(end, gap["to_ms"])
        if a <= start and b >= end:
            raise ValueError("Entire selected source range is silent; no narration cut proposed")
        if a <= start:
            cut = (start, max(start, b - leading_ms))
        elif b >= end:
            cut = (min(end, a + trailing_ms), end)
        else:
            cut = (a + pause_ms // 2, b - (pause_ms - pause_ms // 2))
        if cut[1] > cut[0]:
            removed.append(cut)
    # A short retained fragment is kept with its following gap, never deleted as "speech".
    kept, cursor = [], start
    for a, b in removed:
        if 0 < a - cursor < 100:
            continue
        if a > cursor:
            kept.append((cursor, a))
        cursor = b
    if 0 < end - cursor < 100 and kept:
        kept[-1] = (kept[-1][0], end)
    elif end > cursor:
        kept.append((cursor, end))
    segments, timeline = [], 0
    for a, b in kept:
        if b - a < 100:
            raise ValueError("Selected range is too short for an editable clip")
        segments.append({"source_in_ms": a, "start_ms": timeline, "duration_ms": b - a})
        timeline += b - a
    return segments
