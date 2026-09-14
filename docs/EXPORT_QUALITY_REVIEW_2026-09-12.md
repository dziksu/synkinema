# Export quality and desktop formats review — 2026-09-12

## Findings and changes

The Steam source trailers are 1920 × 1080, 60 FPS, approximately 5.3–5.8 Mbps
H.264. The existing r5 reel is 1080 × 1920, 30 FPS, approximately 5.18 Mbps.
The timeline deliberately blurs its atmosphere layer. Vertical crops and zooms
can enlarge a much smaller portion of the wide source; an output resolution is
not evidence of equivalent source detail.

Previous final rendering recompressed opaque intermediate clips at the delivery
CRF, always rescaled static footage to twice the target dimensions, then resized
it again using zoompan. Range exports also performed another video encode without
an explicit CRF. The updated renderer uses high-quality intermediates, avoids
unnecessary static resampling, uses Lanczos, crops before enlargement where
possible, bounds supersampling and selects ranges before final encoding. Final
encoding uses medium x264, trading additional encode time for quality/compression.

A one-second native landscape Allumeria sample at source time 10 seconds compared
old defaults (CRF 20 intermediate/final, veryfast, double resize) with new defaults
(CRF 14 intermediate, CRF 18 final, medium, native static path):

| Pipeline | SSIM against the same decoded source | File bytes |
| --- | --- | --- |
| Previous defaults | 0.978956 | 1,339,232 |
| Updated defaults | 0.986588 | 1,819,609 |

This is one sample, not a general perceptual quality score or a comparison of
all existing projects. Frames were also viewed. Source/game motion blur remains.

## Validation

- Shared `make check` passed: 128 Python tests, 132 web tests, 18 release tests,
  formatting/lint, deterministic code generation and TypeScript/Vite build.
- Follow-up renderer checks passed after the static crop/bounded-zoom refinement:
  35 engine/export/canvas tests, then all 15 export tests (including two additional
  UHD zoom regressions). Focused web checks passed after the desktop preview fix.
- Real generated outputs cover landscape 720p, QHD 1440p and UHD 2160p; portrait
  720p and UHD; 1:1 and 4:5. Pixel checks cover fit bars, left/right fill crops,
  static 4× zoom, unchanged project state and source-enlargement warnings.
- A range export at 60 FPS has the expected 24 frames / 400 ms with only one final
  composition encode. Snapshot tests verify unchanged revisions, immutable output
  settings, 409 conflicts, invalid dimensions/FPS/framing and both REST/MCP paths.
- Web tests exercise complete export selection, odd-size rejection, pending-write
  blocking, scoped Query keys, cancellation signals and optimistic queue rollback.
- A fresh non-root Docker image passed real FFmpeg rendering, inspection and MCP
  initialization before local deployment. The existing data volume and LAN bind
  were preserved. No Git push or remote publication occurred.
- Desktop UI tested at 1280 × 720: preset selection, fit/fill, quality/FPS controls,
  16 new-project formats, queue submission and playback. Sticky export actions
  remain reachable; the page has no horizontal overflow.
- Actual UI QA project: `f34549a309224d0482903585ffa2b56f` (separate from user edits).
  Landscape 4K/60 export `fbe34b6716ab42eb97f502ba2171b0f8`: 3840 × 2160,
  90 frames, 1.5 s, 8,624,754 bytes; captions visually checked.
  Portrait 720p/60 export `0d929255d65f430db700729ad8446ed8`: 720 × 1280,
  1.5 s, 820,998 bytes. Native playback ended normally without a media error.
  The editor fitted the encoded 9:16 output into 124.3125 × 221 display pixels
  while preserving the project's 16:9 canvas for timeline editing.

For product behavior and agent requests, see [EXPORT_FORMATS.md](EXPORT_FORMATS.md).

## User reel comparison export

The r5 project `21f98d7acf244fb6b3f1c83fafe19159` was exported without changing
its tracks, scenes, script, profile, asset references or revision (compared with
the saved pre-export snapshot). New completed job
`301804c6583b4b848b9de918da9a2767` contains 1620 frames / 27.000 seconds at
1080 × 1920 / 60 FPS, H.264 CRF 18, stereo AAC 48 kHz and 26,697,912 bytes.
Measured loudness is −18.96 LUFS and true peak −2.17 dBTP. Six actual frames were
reviewed, including game names, gameplay, captions and the closing question.
The previous r5 export remains available. Encoding took 545.36 seconds on the
local Colima instance; 60 FPS plus medium encoding is substantially slower than
the previous 30 FPS/veryfast path. No estimated bitrate or upscaled-source detail
was presented as a measured quality guarantee.

The local comparison file is
`examples/steam-breakout-en/out/next-up-steam-hq-60fps.mp4` (ignored media output).

Final native-browser playback of the new reel reached 27.000 seconds with
`ended=true`, decoded size 1080 × 1920 and no media error. The original project
still reports r5.
