# Rendering sequential captions without whole-film passes

The compositor first prepares a lossless primary timeline on disk. Previously,
every group of 12 text/overlay clips decoded and encoded that entire timeline,
even when those captions appeared in different seconds. A 228-caption timeline
therefore required 19 full overlay passes.

The new planner divides the timeline on output-frame boundaries. A window is at
most 30 seconds and normally contains at most 12 distinct layers. Only layers
intersecting that window are opened. Track order remains the compositing order.
If more than 12 layers are simultaneously present, bounded passes apply only to
that short window. Sequential captions ordinarily process each frame once.

All intermediates are streamed to lossless FFV1 files. Completed windows are
joined with stream copy, not another lossy encode. Explicit frame durations and
clip-local clocks preserve boundaries, fades, animation and moving overlays.
Failure/cancellation removes only this render's temporary window files and concat
manifest. The primary source and shared assets are preserved.

The existing `SYNKINEMA_OVERLAY_BATCH_SIZE` setting (default 12, range 1–32) still
bounds layer inputs. Decoder/encoder thread limits remain in effect. There is no
API/schema change and no project migration. Already-running worker processes use
their loaded code until restarted; this change cannot accelerate an existing job.

## Verification

`tests/test_renderer_windows.py` compares every decoded frame of segmented and
unsplit compositions at 12, 25 and 30 fps. Cases cover off-frame caption times,
simultaneous layers, video overlays, opacity animation, fades, blank windows,
long-lived layers, a partial final frame, monotonic progress and failure cleanup.
They also assert actual pixels at layer boundaries: a layer whose clock falls
between canvas frames must stay visible on its last covered frame and on the
film's final frame. FFmpeg timestamps a finished layer's EOF one tick after its
last frame, so `eof_action=pass` used to drop such layers there, producing a
one-frame flash at cuts and a background-only final frame. Layers now use
`eof_action=repeat`; the `enable` window alone bounds visibility.
The existing renderer/export/effects/inspection tests exercise the complete output
pipeline, including delivery formats and audio processing.

Run the isolated synthetic benchmark:

```sh
PYTHONPATH=apps/server .venv/bin/python scripts/benchmark_overlay_windows.py
```

It compares the former full-timeline batching algorithm with windowed compositing
on the same prepared source and warm caption cache: 228 captions, 34.2 seconds,
640×360 at 30 fps. It reports wall-clock time and cumulative intermediate bytes
written. It does not benchmark footage preparation, final H.264 encoding or audio
normalization, and is not an ETA for a 1080p production render.

Measured locally on 25 September 2026 (same machine, sequential runs):

| Overlay stage | Former batching | Temporal windows |
|---|---:|---:|
| Wall-clock time | 26.177 s | 4.093 s |
| Intermediate bytes written | 418,177,968 | 50,987,298 |

This sample was **6.40× faster**, with **8.20× fewer intermediate bytes written**.
