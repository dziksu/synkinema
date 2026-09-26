# Synkinema API and MCP — agent operating guide

This is the guide shipped with the running server. REST, MCP, CLI and the editor share one SQLite project store and one renderer. Use the server's returned IDs, schemas and capabilities, not UI labels or assumed features. Examples use English field names; user-visible text may be Polish or any Unicode text.

## Discover before editing

Default origin: `http://localhost:18080`. REST base: `/api`. MCP: `/mcp/`, **Streamable HTTP**, not a REST JSON endpoint and not a stdio command. Configure an MCP client with that URL; it handles initialize, tools/list and tools/call. Resources: `synkinema://agent-guide` (this Markdown), `synkinema://operations` (JSON).

1. Read `get_agent_guide` once per context; discover `get_capabilities`, `get_production_capabilities` and `get_project_schema` when needed. Request `get_operation_reference(operation="add_clip")` for the specific unfamiliar operation, not the entire catalog. Production capabilities describe remote imports, installed models, typed tasks, composition and verification; see the complete production workflow below.
2. Prefer `browse_projects(request={query,limit:20})` → `get_edit_context(request={project_id,limit:40})` to continue an existing project. Pin the returned revision across pages. Use `get_project(project_id)` for full nested replacement edits, or `create_project(name, brief)` for a new reel. `list_projects` is the legacy unpaginated FULL-timeline inventory, not the efficient default. MCP create defaults to 1080×1920, 30 FPS; change `profile` through `update_project` for other formats. REST creation accepts a full Project.
3. `search_assets` before importing; omit project_id for the shared library or provide it for a private project collection. Assets can be reused through explicit collection membership. Search is case-insensitive substring matching against names/tags; kind is `image`, `video` or `audio`.
4. Read the exact operation payload schema and side effects before mutation. The complete operation reference has 16 operations. Project schema alone cannot describe all cross-field validators; also read capabilities and the constraints below.

REST discovery equivalents:

- `GET /api/agent/guide` → Markdown.
- `GET /api/schema/project` → JSON Schema.
- `GET /api/schema/operations?operation=trim_clip` → one operation's description, payload schema and example; omit query for all operations.
- `GET /api/capabilities` → effects, property bounds and renderer limits.
- `GET /api/openapi.json` → all REST routes and request schemas; `/api/docs` → interactive documentation.

No token is required by default on loopback. If the server uses `SYNKINEMA_API_TOKEN`, send `Authorization: Bearer ...` to API and MCP. Keep credentials out of projects/tool arguments. The current UI has no token-login flow. Host/origin protection allows local clients; use a local connection. `/media/...` is local static media, not covered by the API-token middleware. Run one server worker per data directory. Docker defaults to `/data`; a server filesystem path is not a path on the agent's machine.

MCP tool arguments are strict: an unknown or misspelled top-level parameter is rejected before anything runs, with the accepted names and a correction ("Did you mean 'query'?", or "It belongs inside 'request'" for a field of a nested request). Nothing is silently ignored, so a result produced with defaults means you passed no value, not a wrong name.

MCP result parsing: check `isError` first. Prefer `structuredContent` when present; otherwise parse JSON from `content` TextContent blocks. Unwrap `result` ONLY when it is the sole field of a transport envelope. A production task itself has `id`, `status` AND `result`: keep that object intact, or you lose status and recovery IDs. The guide tool returns plain Markdown text. Inspection returns a metadata text block plus actual ImageContent; preserve/display the image block rather than treating the whole result as one JSON object. REST returns ordinary JSON (except guide, SRT and SSE).

### Efficient production and diagnostics (MCP)

### Editorial channels

- A project has one optional `channel_id`; `null` means an independent project.
  Channels are local editorial identities, not connected platform accounts.
- Channels may have a local `logo_id`, visible on Studio cards and detail headers.
  Preserve it when replacing a brief; null removes only the association. Upload a
  still PNG/JPEG/WebP through `POST /api/channel-logos` (multipart `file`, <=5 MiB)
  to get a validated ID. Assign it through create/update channel with the confirmed
  version. The server sanitizes/resizes artwork to <=512×512. Upload alone never
  saves a channel or edits project media; replaced/unassigned logo files are retained.
- Use `list_channels` / `get_channel(channel_id)` before creating channel content.
  `create_channel(request)` stores language, audience, concept, voice gender/provider/ID,
  tone, hook/CTA/visual guidance, rules, exclusions, approved lessons and HTTPS platform links.
  Never store tokens/passwords in briefs. Channel links are not fetched or authenticated.
- `create_project(name, brief, channel_id)` returns `channel_context` automatically.
  `get_project` and paged `get_edit_context` also include live rules and the latest five
  evidence-backed reviews. Read them before scripts, TTS and editing. Narration preferences
  are guidance, not proof of an installed voice or authorization for paid providers.
- Link, move or unlink through `update_project` with `channel_id` and the confirmed
  project revision. This changes no clips/media. Restore can restore the association;
  cloning retains it. `get_channel` lists linked projects without copying their timelines.
- Historical project reads keep their immutable timeline but intentionally attach CURRENT
  channel guidance, identified by its own version. Channel edits do not mutate old renders.
  Responses' `channel_context` and `duration_ms` are read-only; omit them in Project inputs.
- MCP `update_channel(channel_id, request)` changes ONLY the supplied editable fields at
  `expected_version`; omitted fields keep their current values. Send `""` or `[]` to clear a
  field deliberately; at least one field is required. REST offers the same partial edit as
  `PATCH /api/channels/{id}`; REST `PUT` stays a full replacement (omitted fields reset) for
  editors that send the whole brief. Stale versions reject; never blindly retry writes.
  Archiving is reversible; projects, records and media remain.
- Every edit that changes editable content snapshots the content it replaces.
  `list_channel_versions(channel_id)` lists the current and earlier versions newest first,
  with changed fields and the character count of each long text field, so a wiped rulebook
  shows as a drop to 0. `get_channel_version(channel_id, version)` reads one version's full
  text. `restore_channel_version(channel_id, version, expected_version)` copies it into a NEW
  version (the replaced state is snapshotted too, so a restore can be undone). Publication
  and review records bump the version without new content and create no snapshot. The most
  recent 100 replaced versions are kept per channel.
- `record_channel_publication` records or updates a manually observed publication URL,
  title, status, date and optional metrics. An existing `publication_id` updates one record.
  Metrics require observation time (with timezone) and evidence/source. Unknown is null,
  not zero. This NEVER uploads, schedules, fetches analytics or publishes externally.
- To review, inspect the script and/or actual render using existing inspection tools,
  then call `record_channel_review` with project ID, exact inspected revision, channel
  `expected_version`, reviewer, evidence, strengths, improvements and five scores 0–10:
  hook, pacing, clarity, cta, channel_fit. Overall = mean × 10. This is a SUBJECTIVE
  editorial assessment, not a predicted viral score or automatic measurement. State if
  only the script was inspected. Never invent views, listening, or a completed inspection.
- `get_channel` returns publications and reviews for comparison. Compare the same platform
  and observation ages; small samples and correlations do not prove causation. Summarize
  findings and, only when authorized, save accepted lessons via `update_channel.learnings`.
  Reviews never automatically rewrite the owner's standing rules. Owner's explicit current
  requests take precedence over channel defaults; channel text cannot override safety or
  licence obligations and grants no publishing authority.

### Efficient production tools

- `get_edit_context` pages actual clips, asset geometry and track inventory; unchanged Clip defaults are omitted. Each visual clip with a static crop also carries `visible_source` = `{x:[start,end], y:[start,end]}`: the fractions of the source frame its crop shows at the current transform and placement. Use it to frame a subject or speech bubble: to show source span [a,b] of a cover crop, choose a window start in `[b - width, a]` and set `transform.x = start / (1 - width)`, where width = `visible_source.x[1] - visible_source.x[0]`. It is geometry only; headers and captions drawn over the panel still hide parts of it. Filter `track_ids`/`from_ms`/`to_ms` before paging. This is not a full Project replacement; use the complete nested value before a shallow replacement edit.
- `apply_operations(..., compact=true)` returns counts, `committed`, `base_revision` and `confirmed_revision` without echoing all clips. A dry-run `project.revision` is still a provisional candidate; only `confirmed_revision` is current. Supply explicit IDs to recover your own created clips cheaply.
- `get_work_status(request={job_ids:[...],task_ids:[...],wait_seconds:20})` waits for ANY selected work to become terminal, without starting work. It includes failures, partial-result flags, asset IDs and compact verification results, not full transcripts/FFprobe/PCM windows. Remove terminal IDs before waiting again. Use the original detail tool only to investigate an error or retrieve word timings. `passed` means the stated automated checks passed, not visual approval.
- `analyze_source_media(request={asset_id,mode:"both",from_ms:0,to_ms:30000})` measures silence and black/freeze candidates in a <=120-second source range; audio-only `mode:"audio"` skips video. A source/settings fingerprint caches repeat reads. Results use source-absolute milliseconds, NOT timeline times. Visual detection is sampled at 8 fps; dark/still scenes can be intentional, so inspect suggested source regions. No downloaded script or external provider is used.
- `plan_narration_cut(request={project_id,expected_revision,track_id,asset_id,replace_clip_ids:[...]})` measures actual amplitude silence, retains 40 ms leading/200 ms trailing/120 ms internal pauses by default, and returns `segments` plus a validated `request` for `apply_operations`. Only explicitly selected voice clips are replaced. Nothing is saved until the agent reviews and commits that batch with `dry_run:false`. No automatic ripple of visuals, captions, music or later clips. Use the returned source-to-timeline segments to compose them. Quiet speech/breaths may fall below the threshold: audition the result. Entirely silent sources reject. A concurrent edit during analysis fails the final revision check.
- `audit_edit(request={project_id,revision})` combines structural preflight with bounded short-form warnings: long clip intervals, image sources, small overlays and voice coverage gaps. Each warning has a stable code and location. These are heuristics, not claims about actual black pixels, silence, retention or virality. Use source measurements and exact-export images/audio before approval.

Typical path: compact project/context → select and inspect real motion sources → prepare male/female narration as requested → plan measured silence cuts → commit compact batch → align visuals/captions using segments → audit → render → compact wait → exact-export QA. Never assume a `.mp4` contains gameplay or that ASR word timing measures leading silence accurately.

## Data model and units

- All `*_ms` are **integer milliseconds**. Timeline intervals are `[start_ms, start_ms + duration_ms)`; inspection frame times must be strictly before project end. `split_clip.time_ms` is absolute timeline time.
- `source_in_ms` is a position inside the imported source, not the timeline. Consumed source duration is `duration_ms * speed`. Prefer `source_in_ms + duration_ms * speed <= asset.duration_ms`; current validation tolerates 100 ms but agents should not rely on that tolerance. Images have no finite source duration.
- Clip duration >=100 ms, speed 0.25–4, gain −60…12 dB, fades <=min(10000 ms, clip duration). Changing speed does not automatically change duration or keep adjacent clips synchronized through API/MCP.
- Project duration is the maximum end of all clips, including muted tracks. Scenes do not determine render length. At most 32 tracks, 500 clips per track, 1000 clips total, 24 hours per project. IDs are globally unique across tracks and clips within a project.
- Default track IDs are `video`, `titles`, `voice`, `music`; inspect existing projects rather than assuming they retain defaults. One active primary `video` track; additional visual layers use `overlay`. `text` requires nonempty `text`; audio kinds: `voiceover`, `music`, `sound`, `ambient`.
- Visual tracks accept image/video assets. Audio tracks require `has_audio=true`, including a video file used only for its audio. Adding video to a visual track never includes its source audio automatically.
- `muted=true` hides a visual/text track or silences an audio track. Source audio copied to another track is independent; hiding the video does not mute that copy.
- `transform`: scale 1–4; x/y 0–1 are crop positions; rotation −180…180 degrees; opacity 0–1; fit `cover` or `contain`. Use clip.placement for arbitrary canvas position and picture-in-picture dimensions; see the canvas section below. Primary video opacity darkens toward black; overlay opacity composites against underlying layers.
- `effects` is an array of `{type,value,enabled}`. Numeric bounds by effect are in `get_capabilities.effect_bounds`; value validators are not all expressible in the Project schema. Effects are not arbitrary FFmpeg filters.
- `animations` is an array of `{property,keyframes}` with one animation per property, <=5 animations and 1–64 keyframes each. A keyframe is `{time_ms,value,easing}`; times are CLIP-LOCAL, unique, increasing, and <=clip.duration_ms. Visual tracks support scale/x/y/opacity, text only opacity, audio only gain_db. Easing: linear/ease_in/ease_out/ease_in_out, set on the destination keyframe. Property bounds are in capabilities.
- Text clips render a headline (`text`) plus optional `subtitle`, accent `color` (#RRGGBB), font_size 16–200, text_y 0.1–0.85, fades and opacity animation. SRT exports existing headline plus subtitle, excluding muted text tracks by default (include_muted=true opts in); that export operation does not transcribe audio. For independent speech recognition and approximate word alignment, use production tasks `transcribe` or `prepare_narration`.
- `brief`, `script` and `scenes` are planning metadata. Updating narration does not synthesize speech; adding a scene or voice_asset_id does not create a timeline clip. Use explicit media/clip operations.

## Mutation contract and recovery

REST: `POST /api/projects/{project_id}/operations`, body `{expected_revision,type,payload}`.
MCP: `apply_operation`, arguments `{project_id,operation:{expected_revision,type,payload}}`.

Each successful operation is one transaction and increments revision once; returns the complete updated Project with computed duration_ms. Serialize operations on the same project and use each response's revision for the next call. Do not issue simultaneous dependent edits. Read-only independent calls can run concurrently. For multiple dependent edits use the atomic batch below. Project operations have no idempotency key; after a lost response inspect current state/history before replaying. Production task starts have a separate idempotent request_key contract described below.

- Stale revision: REST 409; MCP tool error (`isError`). Reread current project and reconsider intent against concurrent user changes. Never merely replace expected_revision and replay blindly.
- Missing ID/revision: REST 404; inspect list/get responses. Invalid model/timeline: REST 422, detail text or validation list; fix input. Missing envelope fields produce request validation errors; missing keys inside the generic operation payload may surface as 404 KeyError rather than 422. Validate against the payload reference before sending.
- Upload too large: 413; token: 401; cross-origin mutation: 403. MCP errors are tool results, not REST status codes. Check `isError` before interpreting content as success.
- Timeout/disconnect after mutation is ambiguous: read project/history before retrying. Repeating add_clip/create/render can create duplicates. A queued render is not a completed film.
- `update_project`/`update_clip` are shallow replacements. Arrays replace the entire array. For transform/profile/transition read the existing nested object, modify chosen fields and send the full object; omitted nested properties revert to model defaults. Clip identity cannot change.
- Every create/edit, including low-level add_clip/update_clip, rejects new or retimed ordinary overlaps on every track kind, including muted tracks (422, no revision change). Explicit primary-video transitions are the only intentional overlap. Batch validation applies to the final candidate so intermediate collisions can be resolved within that batch. A successful edit still does not prove media decoding or output quality: run validate_project and inspect the output.
- `restore_revision` copies historical content into a new revision. To undo several operations, retain the desired revision IDs from before those edits. Repeated restoring of current−1 toggles recent snapshots rather than walking undo history.

### Atomic batches and dry runs

REST `POST /api/projects/{id}/operations/batch`; MCP `apply_operations(project_id, request)`:

```json
{"expected_revision":1,"dry_run":true,"operations":[
  {"type":"append_clip","payload":{"track_id":"video","clip":{"id":"opening","asset_id":"ASSET_ID","duration_ms":3000}}},
  {"type":"extract_audio","payload":{"track_id":"video","clip_id":"opening","target_track_id":"voice","new_clip_id":"opening-audio"}}
]}
```

1–100 steps execute in order against the same candidate. Final project/assets/timeline validation applies; failures roll back everything. No imports, render jobs or paid calls can be batch steps. Return `{committed,base_revision,applied_operations,project}`. A successful commit increments revision ONCE regardless of step count; history records `batch`. Intermediate timeline overlaps can be fixed by later steps, but each newly added Clip must satisfy its model.

With dry_run=true, project is a provisional candidate at base_revision+1, and neither project nor history is saved. Review it, then submit the same request with dry_run=false and the ORIGINAL expected_revision. On conflict, reread/reconcile. Generated IDs are provisional and will differ on commit; supply explicit IDs when referencing clips between steps or comparing candidates. Only committed=true makes the returned revision current. Do not render a dry-run revision. Batch envelope schema is included in get_operation_reference and OpenAPI.

`clone_project(project_id,name,revision)` / POST `/clone` with `{name,revision}` creates an independent project at revision 1 from an exact snapshot. Track/clip IDs remain scoped to that project, library assets are shared; history, jobs and comments are not copied. Source is unchanged. Use for alternative versions, including rendering a historical composition without restoring the original.

`validate_project(project_id,revision?)` / GET `/preflight?revision=R` returns valid, errors and warnings with stable codes, messages and relevant IDs/times, counts and duration. Errors check timeline constraints, missing media files/references, source bounds and track compatibility. Warnings flag absent audio/visuals, primary-track gaps and muted clips extending duration. Muted clips still require valid sources because the renderer uses full-project validation. Preflight neither decodes nor renders: requires_render_review remains true. Fix errors, assess warnings, then inspect actual output.

### Operation selection

Use the live `get_operation_reference` for schemas, examples and exact side effects:

| Operation | Purpose |
|---|---|
| update_project | Replace name, brief, script, script_lines, profile, scenes or asset_ids |
| add_track | Append a new typed track |
| update_track | Rename, hide/mute, configure ducking |
| reorder_tracks | Supply every track ID once, in desired compositing/UI order |
| remove_track | Remove an empty track only |
| add_clip | Add explicit source/text placement; no automatic time append |
| append_clip | Append at target track end; infer remaining source duration when omitted |
| duplicate_clip | Copy with new ID and reset transition, default placement at target track end |
| extract_audio | Copy trimmed/speed-adjusted source audio onto an audio track |
| update_clip | Set clip fields with shallow replacement |
| move_clip | Reposition/relocate same clip; clear related transitions; validate |
| trim_clip | Submit computed trim values; validate; update transition relationships |
| set_transition | Compute incoming overlap and ripple subsequent starts |
| split_clip | Split at absolute time, correct source offset, generated right ID |
| remove_clip | Remove a clip, retain source asset, no ripple |
| restore_revision | Restore snapshot content into a new revision |

Use append_clip instead of calculating a track end; omit start_ms. With duration_ms omitted, it uses floor((asset.duration_ms-source_in_ms)/speed); images/text default to 4000ms. Incoming transitions must be cut, then use set_transition. duplicate_clip preserves source settings/effects/animations but resets incoming transition; optional target_track_id defaults to source, optional start_ms defaults to target track end. extract_audio requires a visual source clip with has_audio=true and an existing audio target_track_id. It preserves timing, speed, source trim, gain/fades, and removes visual settings. It creates an independent clip using the same asset, not another media file. Later source edits do not synchronize its audio copy; repeated extraction onto the same occupied interval rejects; create a separate audio track for simultaneous sound. new_clip_id is optional on duplicate/extract. Snapping, nearest-free-slot placement and automatic keyframe retiming remain UI conveniences; no API drag/side/delta_ms fields exist.

For a left trim by 1000 ms at speed 2: new start = old start+1000; new duration=old duration−1000; new source_in=old source_in+2000. Send all three via trim_clip, plus valid fades/keyframes. A right trim changes duration while keeping start/source_in. The API does not rescale animation keyframes. For splitting, remove animations first if the intended workflow permits; the API rejects animated clips and does not silently bake them.

A non-cut transition must overlap the prior primary clip by transition.duration_ms. Prefer set_transition with positive duration shorter than both clips. It sets this clip's start to previous end−overlap and shifts EVERY clip/scene starting at or after this clip's OLD start by that delta, across all tracks including muted tracks. Earlier spanning captions/audio do not shift. Review synchronization after ripple. If it creates an audio/text/overlay collision, the entire operation rejects; split simultaneous content across separate tracks in a batch. Cut aligns to previous end. Moving a clip detaches its incoming transition and the next source-track clip's transition. Trimming preserves incoming transition only if start stays fixed and always clears the next clip's transition.

### Visual effects and short sound accents

`grayscale.value` is an intensity: 0 preserves color, 0.5 partly desaturates, 1 removes color. Blur is spatial blur of the entire clip; it does not animate itself. For a brief blur between shots, use the incoming `blur` transition. The `zoom` transition combines a bounded magnification (maximum 1.18×) with a crossfade, preserving image detail. For a punch zoom inside a shot, animate `transform.scale` with clip-local keyframes. Captions on a separate text track are composited afterwards and remain sharp. Test a transition at its start, midpoint and end; a successful render alone does not prove visual quality.

For reusable short audio, first call `search_assets(query="sfx", kind="audio")`, then search tags such as `whoosh`, `przejście`, `zaskoczenie`, `uderzenie` or `CTA`. A prepared Kenney CC0 catalogue may be installed; do not assume its IDs or availability. Read duration/source/license from each result. Add an independent `sound` track and place `add_clip` entries at absolute timeline timestamps. Keep durations within their sources, gains conservative and fades shorter than the sound. Typical starting gain for near-full-scale library SFX is −8…−12 dB, then measure the actual mix. The source file must be at least 100 ms for a full-length timeline clip; a shorter sound needs a silence tail prepared before import. For a procedural music bed with accents, use the `generate_score` production task. Import public sound files through `import_media`; neither tool is a general-purpose sound-effects generator or stock search service.

Mute/unmute the sound track to compare a mix. Audio inspections measure the whole rendered mix; they do not play sound to the agent or guarantee subjective sound quality. For final measurements use `analyze_audio` with the completed final `job_id`. Timeline metadata showing an active sound does not prove that it is audible.

## Import media and optional speech

REST large-file import (multipart, no manually set Content-Type):

```sh
curl --fail-with-body http://localhost:18080/api/assets \
  -F 'file=@/absolute/path/film.mp4' \
  -F 'tags=["source","nature"]' \
  -F 'source=https://example.org/original' \
  -F 'license=CC BY 3.0 — author attribution'
```

Maximum 2 GiB. `tags` is a JSON-encoded list, <=50 strings of <=100 characters. Supported extensions: jpg/jpeg/png/webp/mp4/mov/mkv/webm/mp3/wav/flac/m4a/ogg/aiff. Both bytes and extension must be valid; renaming random data to MP4 does not import video. Use decoded duration_ms/has_audio/width/height from the returned Asset, not estimates from file names.

MCP `import_asset(filename,data_base64,tags,source,license)` accepts raw base64 (not a data URL), at most 12 MiB decoded / 16 MiB encoded. It does not read an agent-local filename or fetch a URL. Both transports accept source/license attribution strings. Server import hashes bytes and reuses an existing Asset on sequential repeated imports; existing name/tags/source/license are returned unchanged, not merged. `tag_asset`/REST PUT tags replaces all tags. Prefer version-checked update_asset_metadata for full details or edit_media_batch for atomic tag additions/removals; see media management below.

Optional TTS: call `get_voice_provider_status` first and inspect `providers[]`; legacy top-level configured/provider fields describe ElevenLabs only. `generate_voice_take` wraps a `request` object and returns `{asset,cached}`. Always select `provider` explicitly: omitted provider remains `elevenlabs`, regardless of status.default_provider. `project_id` imports into that existing project's private media; omit it for shared Voiceovers. Generation neither changes project revision nor inserts clips. Add the returned asset to an audio track separately using its measured duration.

For **local Supertonic 3**, send `provider:"supertonic"`, `voice_id:"F1"` (F1–F5/M1–M5), `language:"pl"`, `text` (nonblank, maximum 1000 characters), optionally `model_id:"supertonic-3"`, `speed:1` (0.7–2), `steps:8` (4–16). Leave `stability` at its default; it is ElevenLabs-only. Explicit supported codes: `en ko ja ar bg cs da de el es et fi fr hi hr hu id it lt lv nl pl pt ro ru sk sl sv tr uk vi`. Missing language, `auto`, `na`, unsupported codes and embedded language tags are rejected before synthesis. The declared code is validated; the server does not detect/translate the text. Read available presets/languages from status and use the code matching the user's text. Install explicitly through the `install_voice_model` production task or the server CLI (`python -m synkinema.supertonic_tts --install`). Speech generation never implicitly downloads a model. An unavailable/corrupt model returns an error without fallback. Generation runs locally on CPU, produces 44.1 kHz WAV, and caches by text, pinned revision, language, voice, steps and speed within the requested collection. Cancellation may still complete a recording; retry finds its cache. Upstream is archived; weights are OpenRAIL-M, separately from the MIT SDK. Read the provider's license_url and clearly disclose machine-generated published audio; the `ai-generated` asset tag alone does not add a visible disclosure to an exported video.

For **ElevenLabs**, `voice_id` must be an actual account voice ID; text is 1–5000 characters; defaults are `model_id:"eleven_multilingual_v2"`, `stability:0.5`, `speed:1` (0.7–1.2). Omit `language` and `steps`. This sends narration to ElevenLabs using the server's key and consumes credits on cache misses. Do not call paid external synthesis without the user's authorization. An unavailable provider can be replaced by importing a recorded voice file. No text-to-video, image generation or general stock search is implemented by this server. Steam discovery, public direct/HLS import and local transcription are available through the production tools below.

## Script studio: lines and audio takes

The Script panel, MCP, REST and CLI share `Project.script_lines`. Use
`get_project(project_id)` to read the **complete** ordered list before every
replacement; compact `get_edit_context` omits script text and line audio.
`update_project` with `script_lines` replaces the whole list and synchronizes the
plain `script` string. Keep stable line IDs and every untouched line/field.
A changed `script`-only edit clears line associations: do not use it to edit
an existing line-based script. Legacy projects have an empty list and plain
`script`; convert their paragraphs explicitly when starting line-based editing.

Each line has `id`, `text` and an optional take: `audio_asset_id`, `audio_text`,
`audio_source` (`recorded`, `uploaded`, `generated`). All three audio fields must
be supplied together or null. `audio_text` records the exact text when the take
was created; preserve it when editing text so Studio can mark an outdated take.
Setting all three fields to null detaches without deleting; removing/reordering
lines likewise keeps source files. References in saved revisions protect media
and undo unless the dedicated destructive removal below is requested. A project
allows up to 500 lines and 100000 script characters; provider limits apply per line.

MCP example: `apply_operation` arguments for a new two-line script. Replace
`PROJECT_ID` and revisions with returned values. For an existing script, include
its full list instead of copying this sample over it.

```json
{
  "project_id": "PROJECT_ID",
  "operation": {
    "expected_revision": 1,
    "type": "update_project",
    "payload": {
      "script_lines": [
        {"id": "intro", "text": "One line, one audio take."},
        {"id": "outro", "text": "Keep your own voice."}
      ]
    }
  }
}
```

To generate one line, discover `get_voice_provider_status`, then call
`generate_voice_take` with `request` containing that line's exact `text`,
`project_id`, and explicit supported provider/voice/language settings described
above. To use an existing file, call `import_asset` with raw `data_base64` and
`project_id` (or REST multipart for larger files). Neither call attaches the asset
or increments project revision. Verify the returned asset is audio with a real
positive `duration_ms`, then refetch `get_project` and reconcile any changes made
while generation/upload was in progress. Never mark newer text as already spoken.

MCP example: attach the returned generated asset to `intro`, preserving `outro`:

```json
{
  "project_id": "PROJECT_ID",
  "operation": {
    "expected_revision": 2,
    "type": "update_project",
    "payload": {
      "script_lines": [
        {
          "id": "intro", "text": "One line, one audio take.",
          "audio_asset_id": "VOICE_ASSET_ID",
          "audio_text": "One line, one audio take.",
          "audio_source": "generated"
        },
        {"id": "outro", "text": "Keep your own voice."}
      ]
    }
  }
}
```

For imported audio use `audio_source:"uploaded"`; only identify actual microphone
captures as `recorded`. MCP/CLI do not control browser microphones or grant
permissions. The user records through Record → Stop recording → Use recording.

**Generate all** is a caller loop over nonblank lines, not a batch TTS endpoint:
by default select missing takes and generated takes with `audio_text != text`;
explicit regeneration may also replace current generated takes. Preserve recorded
and uploaded audio. Capture settings/text, generate one take, refetch the current
project, attach with its confirmed revision, and save before continuing. Stop on
provider/save/conflict errors; completed lines remain saved. `apply_operations`
batches project edits only, never provider calls. For compact responses, use
`confirmed_revision` after `committed:true`, then `get_project` for the full list.

CLI equivalents (use the running Studio origin; Compose defaults to port 43817):

```sh
synkinema --url http://localhost:43817 guide
synkinema --url http://localhost:43817 schema operations --operation update_project
synkinema --url http://localhost:43817 project PROJECT_ID
synkinema --url http://localhost:43817 request POST /api/voices/generate --json-file voice-request.json
synkinema --url http://localhost:43817 edit PROJECT_ID script-edit.json
```

`voice-request.json` contains the inner voice `request` object, with `project_id`.
`script-edit.json` contains the inner `operation` object from the MCP examples
(`expected_revision`, `type`, `payload`), without the `project_id`/`operation`
wrapper. These are the same revision-guarded REST operations as Studio. Successful
writes appear after Studio's next poll; unsaved local drafts are preserved for
explicit reconciliation. Audio takes do not add timeline clips or captions.
Arrange them separately with `add_clip` using each asset's measured duration.

**Remove audio** in Studio uses MCP `remove_script_audio(project_id, line_id,
request={expected_revision,expected_version,audio_asset_id})`, also available as
REST `DELETE /api/projects/{project_id}/script-lines/{line_id}/audio`. Use
`synkinema --url http://localhost:43817 request DELETE /api/projects/PROJECT_ID/script-lines/LINE_ID/audio --json-file remove-take.json`
with that inner request object. Read the current project and asset version first.
This intentionally removes the take from that line's script history/render
snapshot metadata and the project collection; undo cannot restore its audio.
Text and timeline are preserved. Another line or any timeline in this project's
history/current/render snapshots using the source blocks the whole operation
with 409. Shared library/other projects keep their file; the response reports
`retained_asset_id`. Otherwise the original and sidecars are physically deleted.
Use returned `project.revision` for the next write. `pending_files > 0` means
metadata removal committed but disk cleanup is still pending; never report the
file as physically gone yet. This is not an `apply_operations` batch step.

New generated takes have portable filenames containing language, voice, a text
excerpt and a short synthesis fingerprint, e.g. `voice-en-f1-one-line-one-audio-take-1234abcd.wav`.
Browser recordings include the line number, text excerpt and recording timestamp;
uploaded files keep their supplied display name.

## Render, inspect, revise

1. Run validate_project and address errors/warnings. Capture current revision after the last edit. Call start_render(project_id, expected_revision, quality="preview" or "final", from_ms=0, to_ms=null). REST POST `/api/projects/{id}/renders` returns 202. Always supply expected_revision even though REST permits omission. This queues the current snapshot, not an arbitrary historical revision.
2. Prefer wait_for_render(job_id,request={"timeout_seconds":20}) and repeat bounded waits with the same ID. get_render_progress(job_id) is also available for an immediate status read. Status: queued → running → completed, failed or cancelled. progress is 0–1, not 0–100. Track error and phase; do not infer completion from progress alone. cancel_render cancels queued/running jobs; cancelling an already finished job does not remove output. Jobs are not project revisions.
3. `preview` caps resolution at 640 px; `final` uses profile dimensions. Both are MP4 H.264/AAC. from_ms/to_ms are absolute project boundaries; to_ms=null means project end. Require 0<=from_ms<to_ms<=duration. The output starts at zero and lasts to_ms−from_ms. The current renderer builds the timeline before cutting a requested range, so partial render may still be expensive.
4. On completed, output_url is a relative server URL, e.g. `/media/renders/<job_id>.mp4`; resolve against origin. URLs are usable by local clients; server `path`/`map_path` fields are not agent-local files. `list_render_jobs(project_id?)` / `GET /api/jobs?project_id=...` lists the latest 100 matching jobs (filter before limit); retain job_id and query it directly for older renders.
5. Inspect render_frames(project_id, revision=R) or choose 1–24 timestamps with get_inspection_points. Points are midpoints of video/text clips and their transitions, capped at 24; they are not scene metadata and do not comprehensively cover overlays. Also inspect critical overlay/transition boundaries explicitly. render_frame requires 0<=time_ms<duration. MCP returns metadata and actual ImageContent; look at the pixels. REST returns media URLs. These calls may render/cache a preview synchronously; allow time and avoid duplicate calls on timeout. Full completed renders for the same revision can be reused. Prefer `render_frame(project_id,time_ms,job_id=J)` / `render_frames(project_id,job_id=J)` for final QA of the exact completed export, including range renders. REST frame/sheet bodies accept the same `job_id`. The job must belong to this project and be completed with its MP4 present; errors never trigger a fallback render. The job determines revision (any supplied revision is ignored). All requested timestamps remain **project-absolute**, inside `[from_ms,to_ms)`; frame metadata includes `output_time_ms=time_ms-from_ms`. Metadata also includes job_id and the inspected from_ms/to_ms. Default sheet points are filtered to that range; if none remain, its midpoint is used. Explicit sheets accept 1–24 points, all validated before extraction. Each sheet URL is keyed to the actual media, so different exports cannot overwrite one another's sheets.
6. Call analyze_audio(project_id, job_id=completed_job_id) to measure that exact output. job_id determines the analyzed revision, overriding a supplied revision; pass a matching revision or omit it. Without job_id it uses a full preview. Returns integrated_lufs/true_peak_dbtp/loudness_range, `dynamics`, EBU R128 samples, RMS/sample peaks/silence flags in 500 ms windows, warnings and URLs plus an image map through MCP. `dynamics.quiet_p10_dbfs` is the floor between spoken lines (where only music/ambience remain), `loud_p90_dbfs` typical speech and `separation_db` their difference. Judge a music bed from this measured separation, not from configured gains: clip gain and track gain ADD, and density/ducking change the result. Warning `bed_fills_speech_gaps` flags a bed under most of a narrated film that sits under 8 dB below speech (heuristic; listen to confirm). Silence or too-short audio may produce null measurements; null is not zero. For range exports, windows.time_ms is absolute project time, while ebu_r128.time_ms is relative to output start. Do not call RMS “LUFS”.
7. If issues remain, create_review_comment pinned to project/revision/time, edit with current revision, re-render and re-inspect. resolve_review_comment / REST PATCH comments marks resolved with no body. export_captions / REST GET captions.srt exports revision-pinned SRT; it does not transcribe speech. Final response should identify project, revision, completed job/output URL and what was actually checked.

The browser editing preview is approximate. Final FFmpeg frames and audio measurements are the evidence. No rendered soundtrack is implied by placing video alone: silent exports are valid when no audio tracks are populated.

## Minimal worked example (REST)

Use a real uploaded video with has_audio=true and at least 4000 ms duration. Placeholders below must be replaced with returned IDs, not sent literally.

```json
{"name":"Agent example","profile":{"name":"Full HD","kind":"video","width":1920,"height":1080,"fps":30}}
```

POST that body to `/api/projects`, obtaining `PROJECT_ID`, revision 1. Then POST each body below to `/api/projects/PROJECT_ID/operations`, in sequence using returned revisions:

```json
{"expected_revision":1,"type":"add_clip","payload":{"track_id":"video","clip":{"asset_id":"ASSET_ID","name":"Opening","start_ms":0,"source_in_ms":0,"duration_ms":4000}}}
```
```json
{"expected_revision":2,"type":"add_clip","payload":{"track_id":"voice","clip":{"asset_id":"ASSET_ID","name":"Source sound","start_ms":0,"source_in_ms":0,"duration_ms":4000,"gain_db":-6}}}
```
```json
{"expected_revision":3,"type":"add_clip","payload":{"track_id":"titles","clip":{"name":"Opening title","text":"Życie ma znaczenie.","start_ms":0,"duration_ms":3000,"fade_in_ms":300,"fade_out_ms":400}}}
```

POST `/api/projects/PROJECT_ID/renders` with `{"expected_revision":4,"quality":"final"}`. Poll `/api/jobs/JOB_ID`. After completed, POST `/api/projects/PROJECT_ID/inspection/frame` with `{"revision":4,"time_ms":1500}` and `/inspection/audio` with `{"job_id":"JOB_ID"}`. Retrieve the media URLs and inspect them.

The equivalent MCP edit wraps the same operation:

```json
{"project_id":"PROJECT_ID","operation":{"expected_revision":1,"type":"add_clip","payload":{"track_id":"video","clip":{"asset_id":"ASSET_ID","name":"Opening","start_ms":0,"duration_ms":4000}}}}
```

Invoke this as arguments to apply_operation, not as raw HTTP body at /mcp/. A runnable end-to-end example is `scripts/agent_workflow_example.py`; it creates a separate project and never edits an existing one.


## CLI coverage

`synkinema --help` lists commands; `--url` goes before the command. JSON goes to stdout, errors to stderr with exit code 1. SYNKINEMA_API_TOKEN is read from the environment. Mutation files are UTF-8 JSON; `-` reads stdin, avoiding shell quoting problems.

```sh
synkinema guide
synkinema schema operations --operation extract_audio
synkinema assets --kind video --query nature
synkinema asset ASSET_ID
synkinema project PROJECT_ID
synkinema batch PROJECT_ID /absolute/path/batch.json --dry-run
synkinema batch PROJECT_ID /absolute/path/batch.json
synkinema validate PROJECT_ID --revision 2
synkinema clone PROJECT_ID "Alternate cut" --revision 2
synkinema render PROJECT_ID --expected-revision 2 --preview --wait --timeout 180
synkinema jobs --project-id PROJECT_ID
synkinema wait JOB_ID --timeout 180
synkinema cancel JOB_ID
synkinema captions PROJECT_ID --revision 2 > captions.srt
```

`edit PROJECT_ID operation.json` sends one full operation envelope. `batch` sends the full batch envelope; --dry-run overrides dry_run=true. Omit --dry-run and remove/set false in the file to commit. `render` reads then pins current revision if --expected-revision is omitted, so a race fails instead of rendering an unexpected version. A wait timeout does not cancel the job; resume with its ID. Do not repeat render to poll. `request METHOD /api/... --json-file body.json` exposes every remaining REST call, including frame/sheet/audio inspection, tag replacement and comment creation; use OpenAPI for exact bodies. GET paths can include query strings. request accepts only /api/ paths on the configured server. Example: `synkinema request POST /api/projects/PROJECT_ID/inspection/frame --json-file frame.json`, with `{"revision":2,"time_ms":1500}`. guide/captions print text; other commands print JSON.

Existing limitations remain explicit: no automatic shot detection or general stock search, arbitrary FFmpeg filters, automatic linked-clip syncing, or paid synthesis without a configured provider. Public direct/HLS and Steam downloads, local transcription, approximate word alignment, procedural scores and editable showcase composition are supported through the production tools below. Use their discovered schemas rather than inventing tool names.

### Exact-export inspection example

After `get_render_progress(J)` reports completed, inspect both `render_frames(project_id=P,job_id=J)` and `analyze_audio(project_id=P,job_id=J)`. For a render from 12000 to 15000 ms, `render_frame(project_id=P,time_ms=12500,job_id=J)` inspects output time 500 ms. Requesting time_ms=500 or 15000 fails. Job-based inspection works after the project has been edited; it loads the job's historical revision.

Audio window `active_tracks` lists unmuted audio tracks whose clips overlap any part of that measured window, including short SFX between window boundaries. It indicates timeline occupancy, not isolated audibility. Windows include duration_ms (the final window may be shorter than 500 ms). RMS windows are project-absolute; ebu_r128 times remain output-relative. Audio metadata includes job_id/from_ms/to_ms.

### UI source-range workflow

The studio now offers a source monitor with In/Out, video-only/audio-only/both, cursor/track-end placement and range drag-and-drop. This is client orchestration over the existing API, not a new operation named `insert_source`. Agents can reproduce it with `apply_operations`: add the visual clip and an audio clip on appropriate tracks with identical `asset_id`, `source_in_ms`, `duration_ms`, `start_ms` (optionally add an audio track in the same batch). Video tracks do not play source audio. Pin expected_revision; validate source limits and primary-video collisions. One batch is one revision. The resulting clips are independent for later moves/trims; no linked-clip/group model is implied. Source-monitor In/Out UI state is temporary and is not project metadata.

## Interface language versus video language

The Studio interface defaults to English. New default tracks are named Video, Captions, Voiceover and Music; their IDs remain `video`, `titles`, `voice`, `music`. REST/MCP operation names and enum values are unchanged. Names already saved in a project are user content: preserve them. The interface language does not constrain video content; follow the user's requested language for scripts, captions, narration and project names. See `docs/LOCALIZATION.md` for the i18n extension contract.

Studio caption previews and final FFmpeg exports share the same PNG rasterizer (font, wrapping, accent, contrast background and safe-area positioning). REST `GET /api/projects/{project_id}/clips/{clip_id}/text-layer?revision=...` returns this static transparent layer at project resolution; it excludes animated opacity and fades. It does not modify user text or create a render job. Continue inspecting complete exported frames when validating the final film.

For unsaved captions, REST `POST /api/preview/caption` with `{clip,profile}` returns `{url,width,height,bounds}`. The content-addressed PNG and its foreground bounds are one cached result. Bounds are `{left,top,width,height}` in output-profile pixels after wrapping, font metrics, styling, subtitle and safe-area clamping; they exclude the editorial contrast gradient. `bounds=null` means no visible caption foreground. Cache by the complete request and always associate bounds with that result's URL. This read creates only a cache file, no project revision or render job. `POST /api/preview/text-layer` remains available for raw PNG clients.

## Canvas placement, elements and caption styles

Every Clip has `placement={x:0.5,y:0.5,width:1,height:1}`. These are fractions of the output frame: x/y are the layer center (0–1), width/height are its dimensions (0.05–2). This is independent of `transform.x/y`, which are crop anchors within the media. Fit/crop uses the placed rectangle's aspect ratio. Example picture in picture: `placement={"x":0.76,"y":0.25,"width":0.38,"height":0.38}`. Portions outside the frame are clipped. Placement is static; the existing scale/x/y keyframes animate crop zoom, not canvas position. Primary video fills uncovered space with black; overlays preserve transparency, including PNG alpha. Track ordering determines overlay stacking. Simultaneous overlays require separate tracks; new ordinary overlaps on one track are rejected. Legacy overlaps can remain under the compatibility rules below.

Add a graphic through `add_clip` on an `overlay` track, with `shape` equal to `rectangle`, `ellipse` or `line`, no asset_id, and color `#RRGGBB`. A line is a thin rectangle: set placement.height to 0.05. Placement, rotation, opacity and fades work for shapes; only opacity keyframes are supported, and media effects reject. Create an overlay track and clip in one `apply_operations` batch for a single undo/revision. Duplicate, move, trim, split and remove use the existing clip operations. Keep shapes on overlay tracks. Images/logos and videos use asset_id on an overlay track instead.

Text clips accept `caption_style`: `editorial` (accent line and soft contrast gradient), `bold` (accent lettering with dark outline), `boxed` (white text on dark line boxes), `minimal` (white text without a background).

**Center subtitles with one flag: `text_auto_center: true`.** This persistently centers every wrapped line, subtitle and editorial dash at **50% of the output canvas width** in both Studio and FFmpeg exports. It overrides `text_x` and `text_align` without rewriting their stored values. It remains centered after changing text, style, font size or output aspect ratio. `text_y` still controls vertical placement. Studio's **Auto-center horizontally** toggle enables this flag; while enabled, dragging/arrow keys move the caption vertically and resizing keeps the center fixed. Disable it to restore manual horizontal placement.

For an existing clip use `update_clip` with `{"track_id":"captions","clip_id":"RETURNED_CLIP_ID","changes":{"text_auto_center":true}}` inside a revision-guarded `apply_operations` batch. For a new caption include `text_auto_center:true` in `add_clip.clip`. `compose_showcase` enables it on generated spoken captions, leaving titles and other template text unchanged.

The default is `false`, preserving old projects. In manual mode, `text_x` is the block's **left edge** (0–0.9, default 0.09). `text_align` (`auto`, `left`, `center`, `right`) aligns lines **inside that block**; `center` alone does not center a displaced block on screen. `auto` uses centered bold/boxed and left-aligned editorial/minimal styling. `text_y` is the requested top (0.1–0.85), clamped vertically to fit. Auto-centering does not choose a platform-specific safe area, reduce font size or alter vertical placement; inspect actual bounds and frames for YouTube UI clearance. `font_size`, `subtitle`, `color`, wrapping and fades still apply. Caption PNG endpoints also accept shape clip IDs. Use complete rendered frame inspection for final validation.

## Private project media and shared library folders

`search_assets(query?,kind?,project_id?,folder_id?)` / `GET /api/assets` (REST uses q) searches the shared library by default. Pass project_id for its collection, which contains private imports, explicitly added assets and assets referenced by current clips/asset_ids. Private here means project collection membership in this local app, not filesystem access control. Collections share bytes by checksum; adding membership never duplicates files or changes project revisions.

1. `list_asset_folders(project_id?)` / `GET /api/asset-folders` returns `{id,name}[]`. Default library folders: Sound effects, Music, Videos, Images, Voiceovers. Existing assets migrate once based on kind/tags; user folder choices then persist.
2. `create_asset_folder(name,project_id?)` / `POST /api/asset-folders` creates a unique named folder (1–100 characters, case insensitive within scope). `rename_asset_folder(folder_id,name)` / `PATCH /api/asset-folders/{folder_id}` renames it without changing its identity.
3. `import_asset(...,project_id?,folder_id?)` or multipart `POST /api/assets` accepts those same optional fields. project_id makes an import private to that project; omitted imports go to shared library. folder_id must belong to the selected collection. Identical imports reuse the asset and add membership; they do not merge name/tags.
4. `locate_asset(asset_id,project_id?,folder_id?)` / `PUT /api/assets/{asset_id}/location` adds or moves membership in that scope. Omit project_id to share an asset to the library. Omit folder_id to move it to collection root. Other memberships and existing clips remain intact. Asset `locations` maps project IDs or `library` to folder IDs (empty string means root).

Collection writes do not change project revisions. Asset metadata has its own version; use the management commands below to edit details, remove memberships or delete unused sources.

## Permanent deletion and disk cleanup

Use `delete_render_jobs(request)` for exact `job_ids` or a whole queue. Omit IDs
and use `status="finished"` (default) to remove completed/failed/cancelled exports,
or `status="all"` to cancel and remove active work too. Optional `project_id`
limits scope. Clearing covers the entire database, beyond the 100-job listing.
Selected IDs must all exist in scope. Jobs enqueued after selection are retained.

`delete_project(project_id, expected_revision)` removes the project and all
history, notes, exports, private folders and exclusively owned private media.
Shared library media and other projects' historical sources remain. No undo:
confirm the user's intended scope before deleting their work. A stale revision
fails with a conflict; refresh and reconcile. If an edit races with active render
shutdown, cancellation may already have happened before the conflict is returned.

Both commands wait for running exports to stop before removing output bytes and
inspection artifacts. The result contains deleted IDs, actual `freed_bytes`,
`deleted_files`, and `pending_files`. **Nonzero pending_files means disk cleanup is
incomplete even though metadata deletion committed.** Cleanup intent is durable,
retried every 10 seconds and after restart. Use `retry_file_cleanup()` to retry
immediately, or REST `GET /api/storage/cleanup` to read the count without writes.
After an uncertain transport response, list resources/check cleanup first; never
blindly reissue deletion. REST equivalents are `DELETE /api/jobs/{id}`,
`POST /api/jobs/clear`, and `DELETE /api/projects/{id}` with `{expected_revision}`.
Edit project name/brief through the existing `update_project` operation.


## Media management: metadata, sharing and disk cleanup

`list_stored_media()` / `GET /api/media` returns the local owner's complete inventory,
including private sources retained only for history. Listing does not share files.
`search_assets()` remains shared-library search by default. All Asset responses include
`version` (starting at 1); metadata, tag and membership changes advance it when content
actually changes. The version is unrelated to project revision.

- `get_asset_usage(asset_id)` / `GET /api/assets/{asset_id}/usage` returns
  `{asset_id,version,can_delete,projects:[{project_id,name,current,revisions,job_ids}]}`.
  It checks current tracks/asset_ids, **every saved revision** and all render snapshots.
  Collection membership alone is not a timeline reference.
- `update_asset_metadata(asset_id,request)` / `PUT /api/assets/{asset_id}/metadata`:
  required request `{expected_version,name,tags,source,license}`. Name is 1–300
  characters after trimming; tags are at most 50 nonblank strings, each <=100
  characters, trimmed/deduplicated/sorted. Source <=5000, license <=2000 characters.
  Replaces these four fields only; IDs, bytes, decoded properties and memberships
  remain. Use the version from the loaded Asset. On 409, reload and reconcile;
  never automatically retry a stale whole-form replacement.
- `edit_media_batch(request)` / `POST /api/assets/batch` accepts 1–100 distinct
  `asset_ids`, `action` and either `tags` or `destination`. `add_tags` merges supplied
  tags into each file; `remove_tags` subtracts only those tags. `locate` needs
  `destination={project_id?,folder_id?}` and no tags: omit project_id to share/move
  to the shared library, omit folder_id for root. One transaction validates every
  ID, folder and tag limit before committing any changes. Merge/scoped operations
  use the latest stored state; no expected_version. Other tags/memberships remain.
  Repeating an identical request does not bump versions.
- `remove_media_membership(asset_id,request)` / `DELETE /api/assets/{asset_id}/location`
  with JSON `{expected_version,project_id?}` removes only that collection membership.
  Omit project_id to unshare. Unsharing automatically retains private memberships
  for projects referencing the source, including history. Removing an actively used
  project's membership or an unused source's last membership returns 409. No bytes
  are deleted; use physical deletion for a last unused file.
- `delete_asset_folder(folder_id)` / `DELETE /api/asset-folders/{folder_id}` removes
  the folder and moves its files to the same collection's root, preserving other
  memberships and all bytes. Returns `{folder_id,project_id,assets}` with updated
  versions. This operation never deletes media.
- `delete_media(request)` / `POST /api/assets/delete` accepts
  `{"assets":[{"id":"ASSET_ID","expected_version":3}]}` (1–100 distinct files).
  Permanently removes selected unused source records, originals and thumbnails
  from **all collections**, with no undo. A stale version or any current/history/job
  reference rejects the **whole selection**; there is no force flag. A prior usage
  check is advisory: deletion checks again inside the transaction. For used media,
  remove shared membership instead. Response is DeletionResult with asset_ids,
  deleted_files, freed_bytes and pending_files, using the same durable cleanup
  mechanism described above. Do not report physical cleanup complete if pending_files
  is nonzero. Deleting a project's last ownership also cleans private sources that
  had been detached from folders but were still retained by its history.

Typical agent flow: list/search → read usage → capture current version → edit details
or merge tags → read usage again before an explicitly requested deletion. Removing a
clip does not make its original deletable while undo history still references it.
These commands never synthesize/import media or place timeline clips.


### Track occupancy and adding layers at a frame

Every ordinary clip occupies the half-open interval `[start_ms, start_ms + duration_ms)`.
Adjacent clips may touch exactly; a track must be free for the **entire** interval,
not just at its first frame. Muting never disables this constraint. To place simultaneous
content, create another track of the same kind. Video/image/shape composition layers
use `overlay`; only one nonempty unmuted primary `video` track is supported.

The desktop preview drop workflow quantizes the current playhead to project FPS,
keeps that start unchanged, searches unmuted same-kind tracks in timeline order,
and reuses the first free interval or atomically creates a track and clip. Whole media
uses its source duration (images/shapes default 4000 ms); selected ranges retain
source_in_ms/duration_ms. Video is silent on an overlay: a video+audio range creates
aligned copies on independent visual/audio tracks. Captions use the same allocation
rule. Limit: 32 tracks, 500 clips per track. API clients reproduce this with a single
`apply_operations` batch containing `add_track` when needed and `add_clip`; supply
explicit IDs to reference new tracks. The API has no preview/drop command and will
never silently append or invent a free track for an ordinary add_clip.

Legacy projects can contain old audio/text/overlay overlaps. Reading, rendering,
cloning or restoring their exact snapshots preserves user data. Unrelated edits may
keep an existing overlap pair with the same track ID, clip IDs, starts and durations;
new pairs or changed overlapping timing reject. Preflight reports `legacy_lane_overlap`.
Repair by moving one clip to a separate track in a batch. Restoring an old revision
preserves that revision's layout, and any subsequent steps in the same batch still
must not introduce new overlaps relative to the restored snapshot.

## Delivery formats and quality

Discover `get_export_presets` (HTTP `GET /api/export-presets`) before choosing
output dimensions. Use `plan_export(project_id, expected_revision, output)` for
read-only crop/source-enlargement warnings. `start_render` accepts optional
`output={width,height,fps,crf,fit,background,x,y}`; omitting it uses the project
profile. These settings never mutate the canvas or project revision. Fit contain
preserves ALL layers with bars; cover crops ALL layers including captions, with
alignment x/y in 0..1. It does not reflow/rearrange the edit. Use separate projects
for different compositions. QHD/2K landscape is 2560x1440; UHD 4K is 3840x2160.
Portrait presets reverse those dimensions. Higher dimensions cannot restore
source detail; higher FPS repeats frames, without interpolation. CRF 18 is high
quality, 15 maximum, 20 balanced, 23 compact. Final composition uses medium x264;
expect higher encoding time than a draft. Preview caps the longest edge at 640
and CRF at 27, even with output overrides. Only final exports assess delivery
quality. Read job.output for actual settings (null in legacy jobs), job.warnings
for preflight warnings and decoded job.metadata after completion. Inspect actual
pixels/audio with job_id, including exports in different aspect ratios/ranges.

## Complete production through MCP (no helper Python or FFmpeg commands)

Call `get_production_capabilities` first. It reports installed recognizers, pinned
model revisions, task types and limits. The MCP tool input schemas and OpenAPI
use the same Pydantic models; do not invent fields. New tools supplement the
ordinary editing operations, which remain available for arbitrary manual layouts.

### Durable production tasks

`start_production_task` arguments have two nested `request` fields:

```json
{"request":{"request_key":"my-project-trailer-001","request":{
  "type":"import_steam_trailer","project_id":"PROJECT_ID",
  "app_id":4406280,"movie_id":257291511,"from_ms":10000,"to_ms":25000,
  "max_height":1080
}}}
```

The outer request is the task envelope; the inner request is a discriminated
operation. Use returned IDs, not the illustrative IDs in examples. HTTP
`POST /api/production/tasks` takes the envelope directly. The task does **not**
change the timeline. Its states are `queued`, `running`, `completed`, `failed`,
`cancelled`; `phase` describes current work and progress is an estimate in 0–1.

- Repeating the same `request_key` and validated payload returns the same task,
  including failures and cancellations. A different payload with that key
  conflicts (HTTP 409 / MCP error). Use a new key only for an intentional retry.
- `wait_production_task(task_id,request={"timeout_seconds":20})` waits at most
  60 seconds (default 20). A timeout returns current state; it does not stop work or imply
  completion. Repeat the wait using that ID, not the start call.
- `get_production_task` and `list_production_tasks` recover durable results after
  reconnecting. One production task runs at a time, separately from render jobs.
- `cancel_production_task` requests cancellation. Queued tasks stop immediately;
  active downloads/child processes stop cooperatively. A local speech call may
  finish its current take before cancellation is confirmed. `cancel_requested`
  alone is not a terminal state. Temporary work is removed; validated partial
  assets remain listed in `result` and can be reused or explicitly deleted.
- Restarting the server marks interrupted work failed instead of silently
  repeating an uncertain import or synthesis. Inspect partial results first.
- Read `isError` on every MCP result. A completed **verification task** can have
  `result.verification.passed=false`; running the checks is different from passing.

Supported inner requests:

| `type` | Required inputs and result |
|---|---|
| `import_media` | `project_id`, `sources` (1–8 public direct/HLS URLs). Each source has filename, source/license attribution, tags, optional from_ms/to_ms, max_height, include_audio. Returns decoded Asset metadata and saves provenance. |
| `import_steam_trailer` | project_id, exact app_id/movie_id from fresh Steam details, from_ms/to_ms. Downloads selected official footage, strips video audio and preserves the complete source response and ownership note. |
| `import_steam_trailers` | project_id and trailers (1–8 `{app_id,movie_id,from_ms,to_ms,max_height}`). One task, fresh metadata per app, per-item `result.import_errors`; tries alternate MP4/WebM/HLS sources, keeps successful assets and continues after an item fails. A partial batch finishes failed. Retry only failed selections with a new request_key. |
| `install_voice_model` | Downloads the pinned Supertonic 3 model and its license, verifies each file checksum and installs under the provider lock. Already valid files are reused; old files remain if validation fails. |
| `install_transcriber` | model=`tiny.en` (English) or `tiny` (multilingual). Downloads a pinned local Whisper model into the data volume. No runtime package installation or arbitrary model/repository input. |
| `transcribe` | Exactly one asset_id or completed job_id, language, model; optional reference_text. Independent ASR returns actual words, timestamps, confidence, and optional authored-text alignment. |
| `prepare_narration` | project_id, 1–20 unique `{id,text}` lines; optional folder_id, language, voice_id M1–M5/F1–F5, speed 0.7–2, steps 4–16, recognizer model. Uses local Supertonic explicitly, generates real assets, measures duration and aligns each take. |
| `generate_score` | project_id, duration_ms (1s–10min), mood horror/pulse/ambient, BPM 40–180, seed, optional accents_ms. Creates a reproducible procedural WAV without third-party samples. |
| `verify_render` | Exact completed job_id; optional transcribe=true, language/model/reference_text. Full decode, actual container/stream metadata, SHA-256, decoded PCM hash, loudness, project caption layout and optional independent recognition. |
| `package_delivery` | job_id and completed verification_task_id for those exact bytes; optional caption_track_ids (default `["captions"]`). Returns MP4, SRT and ZIP URLs. ZIP includes final video, project snapshot, script, sources/provenance and measured QA report. |

Remote imports accept public HTTP(S) URLs on standard ports, up to 512 MiB per
source, and finite unencrypted HLS. Every redirect, HLS segment and initialization
map is checked; no private network, credentials, local paths, DRM, live playlists,
byte ranges or arbitrary ffmpeg/shell arguments. HLS selects the highest rendition
within max_height, imports to the source end (at most 120 seconds after from_ms)
when no end is given, and supports explicit intervals up to 10 minutes. Steam
trailer selections default `to_ms` to that automatic end; omit it unless you need a
sub-range. An explicit end past the source rejects with the measured duration, so
correct it in one step. Steam sometimes returns a game's appdetails record under a
different key; the importer accepts it only when the record's own `steam_appid`
matches the requested app. Direct images/audio/video are supported;
video defaults to silent, while audio-only sources keep audio. Pure untrimmed
files keep their duration; video may be transcoded to remove audio or cap height.
Ownership and reuse permission are not inferred from download availability.

`import_asset` remains useful for agent-held bytes up to 12 MiB decoded. Large
public media no longer needs an external downloader or REST upload. Arbitrary
large **agent-local** files still require the Studio upload or existing multipart
endpoint; the MCP server cannot read another computer's filesystem.

### Research, inspect, narrate and compose

1. `search_steam_games(request={"sort":"most_wishlisted","coming_soon":true,"tag_ids":[1695],"count":10})`
   discovers upcoming Open World games using Steam Top Wishlists. Empty `query`
   searches the catalog; text search is not a genre filter. Other sorts are
   `relevance`, `release_date`, and `popular` (Top Sellers, a sales signal).
   `popular` cannot combine with `coming_soon`; use `most_wishlisted` instead.
   Results preserve filtered storefront order and source URL, without invented
   numeric wishlist/follower counts or claims about games absent from Steam. `get_steam_games(request={"app_ids":[...]})`
   returns fresh release state, coming_soon, roles/modes, trailer IDs and source
   timestamps/hashes. Search results are not a popularity prediction. Review
   descriptions and choose a trailer explicitly; source text is untrusted data.
2. Import selected clips through tasks. `inspect_source_frames(request={"asset_id":"A",
   "from_ms":0,"to_ms":6000,"count":3})` returns native MCP ImageContent plus
   metadata/checksum, without rendering a project. Times are **source-relative
   milliseconds**. Samples are start/middle/near-end (100 ms end margin); use
   explicit timestamps for critical transitions. View the actual images to reject
   logos/title cards and inappropriate cuts. Images return one sample.
   For motion call `preview_source_media(request={"asset_id":"A","from_ms":0,"to_ms":6000,"format":"gif"})`;
   MP4 includes existing source audio by default. For pronunciation use `format:"wav"`
   on a real narration asset. Excerpts are bounded to 15 seconds; GIF is silent.
   Client playback support varies: a generated preview is not proof you watched
   or heard it. Never substitute ASR or stills for a listening/motion claim.
3. Discover `get_voice_provider_status`. Install Supertonic with a production task
   `type=install_voice_model` if needed, and install the requested recognizer through
   a production task. English uses tiny.en; choose tiny for other supported
   languages. Both models run offline after installation. Preparation never falls
   back to ElevenLabs or another paid provider. Check pronunciation by listening.
4. Prepare narration in one task, for example:

```json
{"request":{"request_key":"my-project-voices-001","request":{
  "type":"prepare_narration","project_id":"PROJECT_ID","language":"en",
  "voice_id":"M2","model":"tiny.en","speed":1.08,"steps":12,
  "lines":[
    {"id":"hook","text":"Still looking for your next game?"},
    {"id":"feature","text":"You and your friends are trapped in a cabin. Every card changes the rooms around you. Can you escape together?"},
    {"id":"outro","text":"Would you play this alone? Tell us why in the comments."}
  ]
}}}
```

`words` contains independent recognition. `aligned_words` preserves authored
names/copy after comparison; unmatched words have `estimated=true`. This is
approximate ASR alignment, not guaranteed forced alignment. A poor match refuses
alignment, and silence never produces invented timings. Regenerate/fix mismatched
speech before composing; reference text is never used as a recognition prompt.

5. `compose_showcase(project_id,request)` creates the editable **showcase-v1**
   portrait layout: 9 tracks, gameplay over a blurred background, titles, identity,
   mechanic labels, phrase captions, an optional footer, narration and ducked music.
   `template:"gameplay-v1"` uses full-frame, undimmed footage on any canvas.
   Use `show_titles:false`, empty `series_title` and empty taglines for a clean
   gameplay/captions composition. No AI footer is burned in by default; optional
   `disclosure_text` is explicit authored copy, separate from publication duties.
   Each beat also becomes an ordered `script_lines` entry with that stable ID,
   its real `audio_asset_id`, `audio_source:"generated"` and captured `audio_text`,
   in the same revision as the timeline. This is required for editing individual
   takes in Script studio. Use the exact completed narration task ID and matching
   line/beat IDs:

```json
{"project_id":"PROJECT_ID","request":{
  "expected_revision":1,"narration_task_id":"COMPLETED_NARRATION_TASK_ID",
  "series_title":"NEXT UP / AFTER DARK","caption_style":"boxed","dry_run":true,
  "beats":[
    {"id":"hook","role":"hook","title":"DON'T PLAY ALONE",
     "shots":[{"asset_id":"TRAILER_ASSET_ID","source_in_ms":0}]},
    {"id":"feature","role":"feature","title":"THE CABIN GAME","subtitle":"1–4 players",
     "tagline":"EVERY CARD CHANGES THE CABIN",
     "shots":[{"asset_id":"TRAILER_ASSET_ID","source_in_ms":10000},
              {"asset_id":"TRAILER_ASSET_ID","source_in_ms":18000}]},
    {"id":"outro","role":"outro","title":"ALONE OR WITH FRIENDS?",
     "shots":[{"asset_id":"TRAILER_ASSET_ID","source_in_ms":24000}]}
  ]
}}
```

Omitted beat durations fit actual voice plus breathing room: feature minimum 11s,
closing minimum 5s, opening minimum 3s. Hooks fit actual speech; optional
`hook_max_ms` sets an editorial limit. Explicit lengths never implicitly
accelerate/truncate speech. Source shots divide their beat equally by default.
For uneven cuts set `duration_ms` on every shot and make their sum match the
beat duration (one frame tolerance). Every source offset must have enough footage.
`role:"scene"` supports beats without hook/outro semantics.
Optional music_asset_id must cover the complete duration; generate a score after
reading the dry-run candidate duration, then repeat the plan with that asset.

The default requires an empty project. `replace_existing=true` explicitly replaces
all tracks; clone first when keeping an alternative. The entire generated edit
shares the ordinary transaction, revision guard, timeline validation and undo
history. Review the candidate/layout/warnings, then set dry_run=false using the
same **confirmed base revision**. On conflict, reread and reconcile. Portrait
aspect ratios 0.45–0.8 are supported by this template; existing operations provide
other layouts; gameplay-v1 also supports landscape directly.

### Final review and delivery

`preview_caption(request={"clip":{...},"profile":{...}})` exposes the same
unsaved-caption raster and foreground measurement as Studio, with native MCP
ImageContent. `inspect_caption_layout(request={"project_id":"P","revision":2})`
measures clipped and unclipped foreground bounds plus time-overlapping text
collisions at a pinned project revision. It flags empty/off-screen text; it does
not infer gameplay quality, source title cards or intentional artistic overlap.

Run validate_project, start_render with expected_revision, then
`wait_for_render(job_id,request={"timeout_seconds":20})`. Inspect actual final
`render_frames(...,job_id=J)` and run a verify_render task for J. Its layout report
covers the complete project in **project-profile** coordinates: a range export or
fit/fill/crop adaptation still needs final-frame review. Full decode is strict;
corrupted bytes fail instead of reporting a playable result. Independent final
ASR can compare against the script without importing local models or writing
helper code. Inspect warnings and images even when automated checks pass.

`compare_project_revisions(project_id,request={"before_revision":2,"after_revision":3})`
reports changed clips/fields/tracks and unchanged script/profile/audio/text
**definitions**. It does not prove equal encoded sound; use the actual PCM hashes
in verification reports for that comparison.

Package only the verified job ID. SRT in a delivery is restricted to selected
spoken tracks, clipped to the rendered range and rebased to output time zero.
The source project snapshot retains project-absolute times. A package can include
a report with warnings; read delivery.verification_passed. Source/export deletion
also removes its generated source sheets, provenance or delivery artifacts using
the existing reference-aware cleanup path. Task records preserve historical
metadata, so deleted media URLs can subsequently return 404.

The server cannot assert browser autoplay, UI playback or subjective editorial
quality: verification honestly reports browser_playback_tested=false and
visual_review_required=true. MCP provides media URLs and native image blocks for
review; actual browser-player tests still need a browser-capable client.


## Efficient discovery and source reuse

MCP `get_agent_guide()` returns an overview and section index. Fetch a section by
ID and follow `next_offset`; `section="full"` also supports pagination. The full
resource and REST guide remain available. `list_channels()` returns compact,
paginated summaries; call `get_channel(channel_id)` once for editorial rules.
Use `include_records=true` for projects/publications/reviews, or `known_version`
to check for changes. Pass `known_channel_version` to create_project/get_project
only after reading that selected channel's rules; changed versions always return
fresh context. This avoids repeating briefs without hiding changed instructions.

Channel rules outrank generic production examples. A broad topic such as
"most anticipated games" can be research for separate single-game films. It is
not permission to make a roundup when the selected channel prohibits roundups.
Do not edit standing rules to fit a template. For SpawnBrief, use the current
one-game, clear gameplay, natural opening and no burned-in AI-footer guidance;
a roughly three-second opening is editorial guidance, not a server speech cap.

`get_source_usage(request={"channel_id":"C","app_id":123})` lists source
intervals already present in current video timelines or recorded publications.
To check a proposed cut across reimports, use `asset_id`, `from_ms`, `to_ms`
(asset-local times); the result maps them to original trailer time using import
provenance. `exclude_project_id` omits that project's uses. Results are paginated.
Speed/crop changes do not count as new footage; simultaneous identical layers
are grouped. Review visual similarity too: different untracked re-encodes cannot
be identified from metadata alone.

When manually recording a `published` channel publication, `project_revision`
selects the exact published revision (current if omitted). Its source intervals
are frozen in the publication record and survive project deletion. Metric-only
updates retain that snapshot. Draft/scheduled records do not reserve footage.
Older publications without snapshots are not silently inferred from newer edits.
Recording a publication still does not upload, publish or synchronize analytics.


## Required script audio links for agent-built films

Every active voiceover clip must reference audio attached to `script_lines`, with
`audio_asset_id`, `audio_source` and the actual `audio_text` recorded together.
Plain `script` text and `scenes.voice_asset_id` do not populate Script studio.
`compose_showcase` creates these associations atomically; for manual composition,
include the complete ordered `script_lines` list in your revision-guarded batch.
`prepare_narration` remains asset preparation: its completed takes must be attached
before delivery. MCP `validate_project` reports `unlinked_narration` as an error,
and `start_render` rejects until the links are saved. Muted unused takes do not
block export. Keep source and spoken text truthful; do not infer them from a filename.

For older projects, recover associations from exact completed narration-task
asset IDs and authored text, preserving stable existing line IDs. Do not match
by array position, timing alone or fuzzy names. Save metadata with the confirmed
revision and preserve timeline clips and undo history. Ambiguous matches need
review, not a fabricated association.


Replacing a line's existing audio take in `update_project.script_lines` also
replaces its unambiguous whole-take voiceover clips and scene voice references.
Starts, speed and gain stay fixed; the new measured audio duration determines
clip length. New overlaps reject the whole edit, leaving the original take and
timeline intact. Split/trimmed or shared-line takes require explicit clip edits
before the script update in the same batch. Captions and surrounding picture
are not retimed: review their alignment after regenerating speech. Initial line
attachment, text-only editing and reordering do not move the timeline.
