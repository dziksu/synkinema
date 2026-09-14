# Make your first reel through MCP

[Connect your client](AGENT_SETUP.md) · [Full tool guide](../apps/server/synkinema/agent_guide.md)

This walkthrough uses the Synkinema tools available inside your connected AI
client. The agent writes the script and makes editorial choices; Synkinema imports
media, synthesizes speech, edits the timeline and renders on your machine.

## Ready-to-paste brief

After the [read-only connection probe](AGENT_SETUP.md#verify-the-connection), paste:

```text
Create a new Synkinema project named "My first Steam reel". Make a 45–60 second
English portrait reel about three recently released Steam games worth watching.
Use a hook in the first three seconds, show at least 11 seconds per game, explain
who you play and what you do, and end with a question inviting comments. Treat
future popularity as an editorial prediction, not a proven fact.

Use Synkinema MCP for all video-production work. Start by reading get_agent_guide,
get_capabilities and get_production_capabilities. Research fresh Steam details,
choose official trailers, import usable gameplay ranges and retain source credits.
Inspect actual source frames before selecting shots. Download availability is not
reuse permission; keep the result as a local draft until rights are reviewed.

Use local Supertonic English narration and local transcription. Install their
pinned models through production tasks if absent; I authorize those model and
footage downloads. Do not use paid external synthesis. Generate a quiet procedural
score, add readable captions and keep every layer manually editable in Studio.

Use the portrait showcase composer with a dry run first, or documented timeline
operations where necessary. Preserve all existing projects. Use measured voice
durations and confirmed server revisions, then validate and render a preview.
Inspect it, fix issues and render a final 1080×1920 MP4. Inspect frames from that
exact completed job and verify decode, audio, captions and independent speech
recognition. Read the verification result, not just the task status.

Return the project link, revision, final video and delivery bundle, plus any
outstanding editorial or playback checks. Do not publish or upload the video.
```

Change the topic, length or language before sending. Use a short first draft to
learn the workflow; higher resolutions and longer timelines take more CPU time.
For existing footage, upload it through Studio and identify the project to the
agent instead of asking for new imports.

## What the agent should do

| Stage | MCP tools / production task types | Evidence to retain |
|---|---|---|
| Discover | `get_agent_guide`, `get_capabilities`, `get_production_capabilities`, `get_operation_reference` | Actual supported fields, effects, limits and provider availability |
| Create / reuse | `list_projects`, `get_project`, `create_project`, `search_assets` | Returned project/asset IDs and confirmed revision |
| Research / import | `search_steam_games`, `get_steam_games`; tasks `import_steam_trailer` or `import_media` | Fresh source metadata, selected movie ID, downloaded asset dimensions and duration |
| Select shots | `inspect_source_frames` | Viewed MCP image blocks, source-relative ranges without unwanted title cards |
| Narrate | Tasks `install_voice_model`, `install_transcriber`, `prepare_narration` | Completed task IDs, real WAV assets, measured durations and reviewed word alignment |
| Compose | `compose_showcase`, `apply_operations`; task `generate_score` | Dry-run candidate, final committed revision and editable tracks |
| Render / review | `inspect_caption_layout`, `validate_project`, `start_render`, `wait_for_render`, `render_frames`; task `verify_render` | Exact job ID, real output frames and the checks' pass/fail values |
| Deliver | Task `package_delivery` | Matching verification task, MP4/SRT/ZIP URLs, source and QA report |

Names in the task column are **`request.type` values**, not separate MCP tools.
Submit them through `start_production_task`. Discover their live input schemas
rather than inventing arguments. The [canonical guide](../apps/server/synkinema/agent_guide.md#complete-production-through-mcp-no-helper-python-or-ffmpeg-commands)
contains full narration and composition payloads.

## Local models

Check `get_voice_provider_status` and `get_production_capabilities` first. Model
weights persist in `/data`; a fresh container volume may have neither model yet.
Installation requires internet access and disk space; subsequent local synthesis
and recognition do not require an external speech API.

Call **`start_production_task`** with these MCP arguments to install Supertonic:

```json
{
  "request": {
    "request_key": "first-reel-voice-model-001",
    "request": {"type": "install_voice_model"}
  }
}
```

Save its returned task `id`. Call **`wait_production_task`**:

```json
{
  "task_id": "RETURNED_TASK_ID",
  "request": {"timeout_seconds": 20}
}
```

Repeat the wait while status is `queued` or `running`. Treat `failed` and
`cancelled` as terminal, and read the error/partial result. Do not submit a new
start request just because a wait timed out.

For English recognition, submit another **`start_production_task`**:

```json
{
  "request": {
    "request_key": "first-reel-transcriber-001",
    "request": {"type": "install_transcriber", "model": "tiny.en"}
  }
}
```

Use `tiny` for multilingual recognition, and choose a Supertonic-supported language
for narration. The TTS language allowlist does not guarantee pronunciation or
recognition accuracy. See [Supertonic languages and license](SUPERTONIC.md).

The nested `request` fields are intentional: the outer one is the MCP tool
argument, the inner one selects the typed task. `request_key` makes starts
idempotent. Reusing the same key and payload returns the original task, even if
it failed; use a new key for an intentional retry after examining the failure.
Use project-specific unique keys for later work, not these examples everywhere.

## Keep the result editable

- Reuse private project media or shared library assets by returned ID; inspect
  the correct collection by passing `project_id` when needed.
- A server path such as `/data/assets/...` is not a file on your agent's machine.
  Public media can be imported through tasks. For large agent-local files, use
  Studio upload; MCP base64 import is limited to 12 MiB decoded.
- Timeline and source times are integer milliseconds. Use measured asset
  durations; distinguish a source offset from a project timestamp.
- Video layers are silent. Add/extract audio onto voice, music or sound tracks.
  Simultaneous ordinary clips need separate tracks; primary-video transitions
  have their own documented overlap behavior.
- A dry run does not save a revision. Commit against the original confirmed
  revision and use the actual server response for subsequent writes.
- The showcase template expects an empty portrait project. Clone an existing
  project before deliberately replacing its tracks. Other formats and layouts
  use normal editing operations and the [export settings](EXPORT_FORMATS.md).

## Finish with evidence

A preview render caps resolution at 640 pixels; it is useful for iteration but
is not the final high-resolution file. Start the final render with the confirmed
project revision and retain its job ID. Wait for `completed`, not merely 100%
progress, then inspect that exact job even if the project has since changed.

Run `verify_render` for that job, read `result.verification.passed` and its warnings,
then package using the matching verification task ID. A verification task can
complete successfully while reporting failed quality checks. Delivery also exposes
`verification_passed`. Review the returned images and listen to the narration.
Independent ASR alignment is approximate; `estimated` word timings need review.

Server verification cannot confirm browser playback or subjective editorial
quality. Report those checks honestly if the client cannot perform them. Resolve
relative output URLs against the configured Synkinema origin; for example,
`/media/...` becomes `http://localhost:8080/media/...` in the default setup.

The final handoff should include the project URL, confirmed revision, completed
job ID, final MP4 and bundle links, and a short account of the checks and remaining
issues. Open the project in Studio to continue editing any layer manually.

For a reproducible developer example, see
[scripts/mcp_production_example.py](../scripts/mcp_production_example.py) and its
[recorded acceptance run](MCP_PRODUCTION_AUDIT.md). The script creates a QA project,
downloads real footage/models and uses MCP for media processing; it is optional,
not a requirement for connecting your client.
