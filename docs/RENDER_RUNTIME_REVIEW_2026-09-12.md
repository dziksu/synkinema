# Render runtime and progress review

The 27-second NEXT UP reel appeared stuck around 81% because compositing took
several minutes and the queue showed only a generic Rendering label. The process
was alive: its output byte count and CPU time continued increasing.

FFmpeg had roughly 619 threads. The command placed `-threads 4` once before all
inputs, so it constrained only the next input. Options normally apply to the next
input/output file, as documented in the [FFmpeg CLI documentation](https://ffmpeg.org/ffmpeg.html#Description).
Every decoder now receives an explicit allocation from the configured codec thread
budget, the output encoder gets its own limit, and simple filter pools are bounded.
This is not a cap on all operating-system threads: demuxers and other FFmpeg
components still create their own workers. The same 81-input composition was
observed with 72 threads and approximately 1.9 GB resident memory after the change.

Image-based text and shape inputs are now limited to their clip durations.
Previously, an input loop kept decoding and filtering full-frame PNGs after the
overlay enable expression hid the layer. Timeline offsets and fades still apply.

The queue displays the actual server phase, server progress and elapsed time based
on `started_at`. Elapsed time advances independently; progress is never fabricated.
Progress bars expose accessible values and phase descriptions. The running-state
panel expands to fit its text in shorter desktop windows. All new strings are in
the English i18n catalog. Existing TanStack Query polling and the generated HTTP
client remain the only web API access path; there are no contract changes.

The reel also exposed an AAC true-peak overshoot: −1.24 dBTP against a −1.5 ceiling.
Normalized exports now measure the encoded file, attenuate/re-encode audio only
when necessary, and verify the result. Correction preserves the video stream and
exact selected duration, cleans its temporary file and fails explicitly if the
ceiling still cannot be met. This can lower integrated loudness slightly; agents
should inspect the actual output measurements, not assume the requested LUFS.

Validation: **25 backend tests** passed (renderer, real multi-input FFmpeg, AAC
correction, engine, export inspection and caption layout); **9 frontend tests**
passed (queue, i18n, catalog coverage and API architecture). TypeScript/Vite build,
Ruff, Biome and generated API verification passed. Docker image rebuilt and applied
only with an empty render queue; the persistent data volume was preserved.

Final native server export: job `bcb155b7c86544fe9620d9930fb18811`, revision 4,
1080×1920 at 30 fps, 27 seconds, −18.94 LUFS, −1.97 dBTP, no audio warnings.
It completed in 209.45 seconds with prepared clips cached. An earlier run took
570.46 seconds with different cache state; do not interpret the ratio as a
controlled performance benchmark. Full-video SSIM against the earlier export:
0.998326, with a separate 14-frame visual review.
