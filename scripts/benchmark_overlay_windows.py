"""Compare old whole-film layer batches with bounded temporal windows.

Run with PYTHONPATH=apps/server .venv/bin/python scripts/benchmark_overlay_windows.py.
Uses synthetic footage and an isolated temporary store; no live projects/jobs.
"""

import asyncio
import json
import tempfile
import time
from pathlib import Path

from synkinema.media import cached_text_layer
from synkinema.models import Clip, OutputProfile, Track
from synkinema.renderer import Renderer
from synkinema.service import Service
from synkinema.storage import Store


async def main():
    with tempfile.TemporaryDirectory(prefix="synkinema-overlay-benchmark-") as directory:
        root = Path(directory)
        renderer = Renderer(Service(Store(root / "data")))
        profile = OutputProfile(width=640, height=360, fps=30, normalize=False)
        count, length_ms = 228, 150
        duration_ms = count * length_ms
        track = Track(name="Captions", kind="text")
        layers = [
            (
                track,
                Clip(
                    text=f"Caption {i}",
                    start_ms=i * length_ms,
                    duration_ms=length_ms,
                    font_size=28,
                    text_auto_center=True,
                ),
            )
            for i in range(count)
        ]
        source = root / "source.mkv"
        await renderer.run(
            [
                "-f",
                "lavfi",
                "-i",
                f"testsrc2=s=640x360:r=30:d={duration_ms / 1000}",
                *renderer._stage_codec(source),
            ]
        )
        # Both algorithms get the same warm PNG cache and primary intermediate.
        for _, clip in layers:
            cached_text_layer(clip, profile.width, profile.height, renderer.store.path("cache"))
        run = renderer.run
        written = 0

        async def measure_run(args, *rest):
            nonlocal written
            result = await run(args, *rest)
            written += Path(args[-1]).stat().st_size
            return result

        renderer.run = measure_run
        start = time.perf_counter()
        previous = source
        for index in range(0, count, renderer.overlay_batch_size):
            output = root / f"legacy-{index}.mkv"
            await renderer._apply_overlay_batch(
                previous,
                layers[index : index + renderer.overlay_batch_size],
                {},
                profile,
                duration_ms / 1000,
                output,
                None,
            )
            if previous != source:
                previous.unlink()
            previous = output
        legacy_seconds, legacy_bytes = time.perf_counter() - start, written
        previous.unlink()
        written = 0
        start = time.perf_counter()
        await renderer._compose_overlays(
            source, layers, {}, profile, duration_ms, root / "windowed.mkv", lambda _: None
        )
        seconds = time.perf_counter() - start
        print(
            json.dumps(
                {
                    "size": "640x360",
                    "fps": 30,
                    "duration_ms": duration_ms,
                    "captions": count,
                    "legacy_seconds": round(legacy_seconds, 3),
                    "windowed_seconds": round(seconds, 3),
                    "speedup": round(legacy_seconds / seconds, 2),
                    "legacy_written_bytes": legacy_bytes,
                    "windowed_written_bytes": written,
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    asyncio.run(main())
