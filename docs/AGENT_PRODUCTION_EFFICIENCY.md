# MCP production efficiency review

Date: 2026-09-13. Scope: existing local Synkinema production workflow, informed by
the four SpawnBrief recuts. No new paid provider, model, plugin or remote service.

## Findings and implemented recommendations

| Observed bottleneck | Built-in improvement | Why it helps |
| --- | --- | --- |
| `list_projects` loads complete timelines, defaults, scripts and scenes for every project | `browse_projects` | Small searchable, paginated index. Loads timeline details only for the selected page; Unicode name search. |
| Agents reread full projects to find a few clips or source bounds | `get_edit_context` | Revision-pinned pages, track/time filters, explicit timing and source geometry. Model defaults are omitted. |
| Polling several renders/tasks separately returns repeated transcripts, PCM windows and FFprobe metadata | `get_work_status` | One bounded wait/read for 1–20 IDs, with failure/partial-result/artifact/QA summaries. Full evidence remains available on demand. |
| Manual FFmpeg downloads and silence parsing consumed calls and produced arithmetic risk | `analyze_source_media` and `plan_narration_cut` | Local measured silence, source-absolute timestamps, cached detection and validated batch/source-to-timeline segments. No need to download voice WAVs merely to calculate cuts. |
| Black/static source footage was discovered after expensive rendering | `analyze_source_media` | Bounded black/freeze candidates before composition; actual source frames remain the visual check. |
| Structurally valid edits still had long holds, small gameplay and voiceover gaps | `audit_edit` | Compact heuristic findings with exact clip IDs, time ranges and inspection points, combined with existing preflight. |
| A 70-operation edit echoed all clips again | `apply_operations(compact=true)` | Counts and confirmed revision instead of the complete candidate/project. Keeps default legacy response compatible. |
| Startup instructions/reference reads were repeated, and an application `result` field was mistaken for a transport envelope | Shorter server instructions and updated agent guide | Targeted operation discovery; explicit single-field-only envelope unwrapping. |

The new tools are MCP-only adapters over existing service validation, project
models and renderer. No duplicate web API, direct frontend fetch, DTO or new
mutation engine was introduced. REST endpoints and generated client remain
unchanged; `api:check` verifies that claim.

## Reproducible payload benchmark

Run `.venv/bin/python scripts/benchmark_agent_payloads.py`. It creates disposable
synthetic projects and a representative verification result, never user media.

| Comparison | Existing JSON | Compact JSON | Reduction |
| --- | ---: | ---: | ---: |
| Index, 10 projects × 80 clips | 421,961 bytes | 1,979 bytes | 99.53% |
| Same project's 80 clips | 41,073 bytes | 9,868 bytes | 75.97% |
| Verification status vs detailed evidence | 26,356 bytes | 545 bytes | 97.93% |

These are UTF-8 JSON payload sizes, not measured tokenizer counts, whole-session
savings or render speed improvements. Index/status views deliberately return
less detail; agents still fetch precise evidence when required. Added tool
schemas also have a discovery cost, so six focused tools were preferred over a
large collection of overlapping one-off helpers.

## Safety and limits

- Existing APIs remain compatible. All actual edits go through `Service.batch`.
- A narration plan performs dry-run validation only. Commit is a separate,
  revision-guarded call. Revisions are checked again after decoding, so a user's
  concurrent change is not overwritten.
- Only explicitly named voice clips may be replaced. Other tracks are never
  silently rippled; the agent receives a timing map and a warning.
- Entirely silent sources reject. Very short retained speech fragments are
  preserved with additional silence instead of being discarded.
- Source detection permits only imported, in-bounds video/audio, <=120 seconds,
  fixed FFmpeg filters, local file/pipe protocols and a 45-second timeout.
  Cache identity includes source checksum/stat, range, thresholds and algorithm
  version. Missing files do not return a stale cached success.
- Visual detection uses 8 fps/320 px samples: freeze/black reports are candidates,
  not exact frame-level truth or proof that a scene is unsuitable. Dark art,
  still compositions, breaths and quiet speech need human/agent review.
- Audits do not claim to understand gameplay, measure virality or replace
  listening. Exact rendered frames, measured audio and source rights still matter.
- Not-found work IDs are reported individually. A failed task can retain partial
  artifacts; these are explicitly marked instead of represented as completion.
- Full operation/project/production results remain available for recovery. No
  transcript, media source or historical revision was deleted to save tokens.

## Deferred, intentionally

- Automatic subject tracking/reframing and cinematic shot ranking require a
  separately evaluated vision model; a freeze detector is not that model.
- A one-call render-and-publish pipeline would conflate quality review with an
  external publication side effect. Upload/scheduling remains separate.
- No increase in concurrent video renders: resource limits and output quality
  need measurement before changing concurrency. Bulk status is not bulk execution.
- No additional general-purpose shell MCP. Typed analysis/edit plans are safer,
  easier to validate and cheaper for agents than generating arbitrary scripts.

Tests cover real WAV silence, source offsets, cache reuse, black/frozen footage,
bounded output, partial failures, dry-run/commit distinctions, concurrent revision
conflicts, explicit replacement scope and discovery through the actual MCP transport.

## Verification and local rollout

- `make check`: passed (158 Python tests, 137 frontend tests, 18 release-tool tests,
  formatting/lint, generated API drift check, TypeScript and Studio build).
- Isolated new-image smoke: passed, including actual FFmpeg render/frame inspection
  and MCP initialization; user data volume was not mounted in the smoke container.
- Running-container HTTP smoke: passed after updating the local `synkinema:local`
  image. No remote image or repository release was published.
- Actual MCP transport advertises 66 tools. All six additions exercised successfully:
  compact index/context/status/audit, real existing narration measurement and cache hit,
  and a dry-run narration plan (2,549 ms removed, committed=false). Project revision
  remained 2; no edited video was regenerated or uploaded by this implementation task.
- Before restart: zero queued/running production or render jobs. The existing
  `synkinema_synkinema-data` volume was retained.
- Before/after counts unchanged: 21 projects, 210 assets, 91 revisions, 48 render
  jobs and 94 production tasks.

Existing non-blocking warnings: Starlette/httpx deprecations during tests and a
Studio bundle chunk above Vite's size-warning threshold. Neither is introduced
by these MCP tools.
