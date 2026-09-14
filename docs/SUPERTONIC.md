# Local speech with Supertonic 3

Supertonic converts **text into speech**, not prompts into scripts. It is an optional
local CPU provider alongside ElevenLabs. Text stays on the server during generation.
Only explicit supported language codes are accepted; no auto-detection, translation,
voice cloning or fallback mode is implemented.

## Installation and maintenance

Docker includes `supertonic==1.3.1` and pinned dependencies in `requirements.txt`.
The explicit installation downloads ~401 MB into `/data/models/supertonic-3` in
the existing persistent volume. Choose MCP or a terminal:

### Install through your agent

After [connecting an MCP client](AGENT_SETUP.md), call `start_production_task`:

```json
{
  "request": {
    "request_key": "supertonic-install-001",
    "request": {"type": "install_voice_model"}
  }
}
```

Retain the returned task ID and call `wait_production_task` with
`{"task_id":"RETURNED_TASK_ID","request":{"timeout_seconds":20}}` until terminal.
Read failures instead of assuming installation succeeded. Reusing a request key
returns the original task; use a new key for an intentional retry after a failure.
The task verifies the pinned model files and coordinates with the provider lock.

### Install from a terminal

For the README's standalone container:

```sh
docker exec synkinema python -m synkinema.supertonic_tts --install
```

For a Compose installation, use
`docker compose exec synkinema python -m synkinema.supertonic_tts --install` instead.
Local development uses `pip install -c requirements.txt -e '.[speech]'`
and `python -m synkinema.supertonic_tts --install` with the project virtualenv.
Installation requires network access; generation never downloads missing weights.
Do not delete the data volume to update or disable this provider.

### Model maintenance

The pinned source is `supertone-oss-archive/supertonic-3`, revision
`aafc6e32416a594460b32413efc49d7fe4ce6d46`. The packaged `supertonic_model.json`
records sizes and hashes for all 18 files, including the full model license.
The installer verifies every hash. Runtime checks all sizes for availability,
then verifies every hash before first model load. A corrupt or unavailable model
returns an error, never substitute speech. A production-task installation resets
the provider's loaded engine/error state when it replaces the model. After repairing
files manually following a load failure, restart the server. Models stay loaded
for reuse; ONNX telemetry is disabled.

`SYNKINEMA_SUPERTONIC_DIR` overrides the model directory.
`SYNKINEMA_TTS_THREADS` defaults to 4 and is clamped to 1–8. Local synthesis runs
outside the HTTP event loop, with serialized access to the shared ONNX engine.
There is no in-browser model download. Use one API process for the local workspace;
the provider lock is process-local, not a distributed job queue.

For batch narration with word timing, separately install the local recognizer
through `install_transcriber` (`tiny.en` for English or `tiny` for multilingual
input), then use `prepare_narration`. These are typed production tasks submitted
through `start_production_task`; they never fall back to paid synthesis. Timings
use independent recognition and approximate reference alignment, with unmatched
words marked estimated. See the [first MCP reel](AGENT_QUICKSTART.md#local-models).

Upstream archived the project on **2026-09-09** and ended maintenance/security
updates. The integration is intentionally frozen and optional. Review upstream
and dependencies before upgrading the model or SDK; regenerate OpenAPI and run
the regression suite after any contract change.

## UI

Open a project's **Script** tab, enter narration, choose **Supertonic 3**, explicitly
select the language of that text, then choose a voice, quality and speed. Generate
into project media and listen to the actual returned WAV. Place it on a voiceover
track from the media browser. Provider controls use TanStack Query and the generated
Swagger client. Pending generation never inserts a fake playable asset or revision.
Success refreshes scoped media, inventory and provider status. The text/script itself
is not modified by synthesis.

## REST and MCP contract

Discover `GET /api/voices/status` or MCP `get_voice_provider_status` first.
Read `providers[]` for `configured`, `languages`, `voices`, `input_limit`, `model_id`,
`local`, `reason`, `license_url`, and `upstream_archived`.
The legacy top-level `provider/configured/input_limit` still describe ElevenLabs.
`default_provider` is a UI preference; omission of `provider` in a generation request
continues to select ElevenLabs for backward compatibility. **Always send provider.**

`POST /api/voices/generate` body:

```json
{
  "provider": "supertonic",
  "model_id": "supertonic-3",
  "text": "Żółw błotny potrzebuje naszej ochrony.",
  "language": "pl",
  "voice_id": "F1",
  "speed": 1.0,
  "steps": 8,
  "project_id": "EXISTING_PROJECT_ID"
}
```

MCP: `generate_voice_take({"request": <the same object>})`.
The result is `{asset, cached}`. The real 44.1 kHz WAV is probed and imported into
the project's private media. Omit `project_id` for shared **Voiceovers**.
It does not insert timeline clips, change revision, or update scene references.
Add a clip separately using the returned `asset.id` and measured `duration_ms`.

Limits: nonblank text at most **1000 characters**; preset **F1–F5 / M1–M5**;
speed **0.7–2.0**; steps **4–16**, default 8. `stability` is ElevenLabs-only and
must remain its default when using Supertonic. Other model IDs are rejected.
Unsupported/missing language, `auto`, `na`, and embedded language tags return 422
(MCP `isError`) before inference or asset creation. The allowlist validates the
declared language code, not the linguistic content; agents must choose the code
matching the text and inspect pronunciation. Supported codes (31):

`en ko ja ar bg cs da de el es et fi fr hi hr hu id it lt lv nl pl pt ro ru sk sl sv tr uk vi`

Cache identity includes exact text, provider, pinned model revision, language,
voice, speed and steps; cache lookup respects the requested media collection.
Concurrent identical requests reuse the completed recording. A disconnected
caller does not terminate an ONNX worker or remove its input during import; the
completed recording may remain in the collection and can be recovered by a retry.
Failed synthesis removes temporary files and does not fabricate a successful asset.

ElevenLabs continues to use server-side `ELEVENLABS_API_KEY` and account voice IDs,
with 5000 characters and speed 0.7–1.2. It sends text externally and consumes
credits on cache misses: use only with authorization. No paid calls are made by
Supertonic or its regression tests.

## License and output review

The SDK is MIT; **weights are OpenRAIL-M**. Preserve the downloaded LICENSE and
all use restrictions when distributing the model or providing model access.
Clearly identify published model output as machine-generated, as required by
Attachment A(e). Assets carry `ai-generated`, language and voice tags plus the
license URL. This metadata does not automatically burn an AI disclosure into an
exported video: authors must include the disclosure when publishing.

Sources: [model card](https://huggingface.co/Supertone/supertonic-3),
[archived upstream](https://github.com/supertone-oss-archive/supertonic),
[pinned license](https://huggingface.co/supertone-oss-archive/supertonic-3/blob/aafc6e32416a594460b32413efc49d7fe4ce6d46/LICENSE).
