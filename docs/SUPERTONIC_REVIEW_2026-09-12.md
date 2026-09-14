# Supertonic 3 integration review — 2026-09-12

Implemented and deployed to the local Docker workspace. Optional local CPU speech
provider, with explicit language selection, ten presets, speed, quality, private
project imports, playback, cache and the existing REST/MCP interfaces. The web
client uses TanStack Query and the generated swagger-typescript-api client.

## Real generation results

Measured on this workstation's running Docker server, including import/probing:

| Request | Audio duration | Generation | Cached repeat |
|---|---:|---:|---:|
| Polish F1, 8 steps, speed 1 | 8.359 s | 3.206 s (cold) | 0.005 s |
| English M1, 8 steps, speed 1 | 5.712 s | 1.486 s (warm) | 0.004 s |
| Polish M2, 5 steps, speed 1.15, fresh MCP call | 5.712 s | 2.219 s (after server restart) | — |

Both REST samples are valid finite, nonsilent 44.1 kHz WAVs with zero clipped
samples. Health requests completed in approximately 4 ms during synthesis.
MCP status discovery, fresh synthesis, shared REST/MCP cache identity and invalid
language rejection were tested against the running service. No ElevenLabs calls
were made.

This verifies technical suitability and latency for short local voiceovers.
It is **not a listening-panel score or a pronunciation evaluation**. Real synthesis
was exercised in Polish and English; the other 29 advertised languages were
validated as supported request values, not evaluated for spoken quality. Names,
numbers and specialist terms still need an editorial listening pass. Each voice
has its own pacing; generated audio includes short leading/trailing silence which
can be trimmed with the existing source-range/timeline controls.

## Desktop end-to-end checks

- At 1440 × 900, provider controls, explicit language/preset selection, disabled
  pending controls, result playback and dark audio controls fit without horizontal
  overflow. English UI and generated language labels are retained.
- Polish F2 / High (12 steps) generated from the Script tab. The actual audio
  decoded and played to its 7.871565 s end without media errors.
- Native drag and drop moved that recording from private Project media to the
  Voiceover lane at 0 ms; the saved clip duration was 7872 ms.
- A preview export containing that voice and an AI disclosure caption completed.
  The exported frame was visually inspected. Exact-job audio analysis measured
  **−16.02 LUFS**, **−2.43 dBTP**, no clipping windows and no audio warnings.
- Reloading and generating the same Polish F1 take returned the cached real WAV.
  Browser error log was empty.

## Regression and contract verification

- Full backend: **110 tests passed**.
- Full frontend: **127 tests passed**.
- After final schema examples and MCP initialization documentation changes, the
  relevant backend contract suite passed (30 tests), with the final agent contract
  rerun passing (4 tests).
- After final cache invalidation/theme changes, relevant UI/architecture/locale
  tests passed (6 tests), and the production TypeScript/Vite build passed.
- Generated API drift check, Ruff checks/formatting and Biome formatting passed.
- Existing build notice remains: the primary JS bundle exceeds Vite's advisory
  500 kB threshold. Tests also report existing Starlette/httpx deprecation notices.

Regression cases cover all 31 language codes, unsupported/missing/auto language,
invalid provider settings, input limits, nonfinite model output, missing/corrupt
weights, no implicit download, concurrent cache requests, cancellation during
import, temporary-file cleanup, private media visibility, unchanged project
revision, legacy ElevenLabs payload identity, real-result-only UI state, errors,
retry, cache invalidation and forwarded query AbortSignal.

The model manifest was verified inside Docker and persists outside the image.
Upstream is archived; SDK 1.3.1 and model revision are pinned. See
[installation and license contract](SUPERTONIC.md).

## Cleanup and retained samples

Deleted only the temporary QA project, four generated library assets, two QA jobs
and their derived files: **11 files / 3,235,323 bytes**, zero pending cleanup.
Removed media/export URLs returned 404. Remaining project, media and job records
matched the baseline captured immediately before this test.

Intentional review artifacts remain outside the app library in ignored
`.data/qa/supertonic-3/`: `supertonic-3-pl.wav`, `supertonic-3-en.wav`,
`supertonic-ui-test.mp4` and `results.json`. These are **AI-generated samples** under
the model's OpenRAIL-M requirements. The performance numbers are observations on
this machine, not guarantees for other hardware or every language.
