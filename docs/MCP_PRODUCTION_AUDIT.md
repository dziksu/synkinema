# Production MCP audit — 2026-09-12

The Steam horror reel used several local production scripts plus manual shell/media
checks. The missing capabilities are now server operations, shared by MCP and
OpenAPI. Agents no longer need to reproduce their implementation in Python.

| Previous outside-MCP work | Replacement |
|---|---|
| Steam HTTP requests, parsing trailer IDs, checking play modes | search_steam_games + get_steam_games |
| download.py: resolve HLS renditions, concatenate segments, trim/strip sound, upload | import_media / import_steam_trailer tasks |
| ffmpeg source contact sheets to avoid logos and title cards | inspect_source_frames, native MCP images |
| Local CLI installation of Supertonic | install_voice_model task, pinned checksums/license |
| prepare.py and align_voice.py: generate takes, install local Whisper, inspect actual durations, align phrases | install_transcriber + prepare_narration tasks |
| NumPy/WAV music generation | generate_score task with seed, mood and accent times |
| compose.py/polish.py: build dozens of clips, wrap titles, synchronize phrases | compose_showcase dry run and atomic commit |
| Custom text-bound scripts that only saw clipped rectangles | inspect_caption_layout with unclipped foreground measurements |
| revise_closing.py + manual revision JSON comparison | existing apply_operations + compare_project_revisions |
| Repeated shell polls | wait_production_task / wait_for_render, bounded long polling |
| collect_render.py, ffprobe/decode, hashing, independent final ASR | verify_render task pinned to a completed job |
| Manual MP4/SRT/JSON/provenance collection | package_delivery task with checked checksum |

There are 60 MCP tools (14 added here), including 9 typed asynchronous production
operations. One narration request can synthesize and measure up to 20 takes;
one composition request generates the complete editable timeline. One verification
request replaces several independent shell commands. These reduce agent round
trips and bespoke scripts; no unsupported claim of faster model inference is made.

The authoritative payload recipes, limits, error handling and inspection workflow
are shipped in [agent_guide.md](../apps/server/synkinema/agent_guide.md#complete-production-through-mcp-no-helper-python-or-ffmpeg-commands).
The runtime exposes them through get_agent_guide and synkinema://agent-guide.
Tool descriptions and HTTP operation descriptions share production/reference.py;
Pydantic models generate both MCP schemas and swagger-typescript-api types.

Production does not bypass the web API invariant: no new component/store HTTP
calls exist. Any future production UI must use TanStack Query options/mutations
and the regenerated HTTP client. No fake completed assets or optimistic render
success should be projected. See [WEB_API_ARCHITECTURE.md](WEB_API_ARCHITECTURE.md).

Production tasks are durable SQLite rows, distinct from render jobs. Their
idempotency keys prevent accidental repeated imports/TTS after network timeouts.
Cancellation preserves validated partial assets. Interrupted work is failed on
restart instead of automatically replayed. A single production worker limits
CPU/model/download pressure; media lifetime shares the deletion/inspection lock.
Downloads are byte bounded, validate every redirect and HLS child URL, pin public
DNS addresses, and never pass remote manifests to FFmpeg. No caller-supplied
Python, shell, credentials, arbitrary model repository or paid provider is exposed.

Whisper tiny.en/tiny are optional pinned models downloaded into the data volume;
the image includes faster-whisper and its CPU runtime. Recognition is independent
from authored script alignment. Estimated word timings remain explicit. This is
an approximate recognizer, not a phonetic forced aligner or a guarantee of perfect
pronunciation. Source content remains subject to its owner's rights.

Intentional boundaries: arbitrary large agent-local files still use the existing
Studio/multipart upload; a remote server cannot read the agent's filesystem.
Unencrypted public VOD is supported; DRM, live playlists and authenticated sites
are not. The first high-level layout is portrait showcase-v1; ordinary editing
operations remain available for other styles. Visual judgement and native browser
playback cannot be certified by a server process. Verification reports those
limits explicitly rather than claiming a check it did not perform.

Regression coverage is in tests/test_production.py, alongside the existing MCP
contract, caption rendering, deletion, and web architecture checks. It covers real
MCP transport through composition/render/decode/ZIP, range-relative SRT, actual
source decoding, cancellation, failure/partial results, retry/restart semantics,
revision conflicts, source transport validation and title collisions. Deterministic
tests stub only speech/network providers; live acceptance checks use the running
server and production providers.

## Live acceptance evidence

The real MCP SDK/Streamable HTTP client in
[scripts/mcp_production_example.py](../scripts/mcp_production_example.py) created
[QA • MCP complete production](http://localhost:8080/#/projects/617d144b754c42c084b56012f0d136fe).
It contains a real 15-second Steam HLS excerpt (1280×720, imported as silent video),
two Supertonic M2 takes, independent local Whisper timings, procedural score and
an editable 14-second portrait timeline. No client-side FFmpeg, ASR, audio
synthesis, media download or REST fallback is used by this example; Python is
only the MCP transport client. Agents with a connected MCP client call the same
tools directly and do not need to run the example script.

Both narration takes matched the authored copy (ASR match ratio 1.0). Initial
export verification correctly returned passed=false for −18.03 LUFS against a
−16 LUFS target. A revision-guarded MCP edit raised the background score from
−8 dB to −2 dB; revision 3 was rendered and independently verified again. The
corrected exact job `2e06ffaf3301407383d0379ef05764d5` passed decode, caption layout,
audio checks and script recognition: −17.46 LUFS, −2.04 dBTP, no audio warnings.
Source and final contact-sheet ImageContent were visually inspected. Server QA
continues to report browser_playback_tested=false, as designed.

Development still uses ordinary repository tools for code changes, tests,
OpenAPI client generation and Docker deployment. Those are application
maintenance activities, not missing video-production methods. Final validation
includes make check (Python and frontend tests, Biome/Ruff, generated contract,
release-tool tests and production build) and the live MCP flow above.

Final local gate: **148 Python tests, 137 frontend tests and 18 release-tool tests
passed**, with generated API verification, formatting/lint and production build.
The final running MCP advertised 60 tools and respected the requested Steam
search limit. The corrected delivery ZIP has verification_passed=true; its video
SHA-256 is `714f6531abe0ac6432ff3af789e2de5be8df348ba86ebfefabccca0752bd670e`.
