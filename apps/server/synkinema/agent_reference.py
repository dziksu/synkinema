"""Discoverable agent contract; schemas derive from the same models used by the service."""

import re
from copy import deepcopy
from pathlib import Path

from .channel_routes import DESCRIPTIONS as CHANNEL_DESCRIPTIONS
from .models import BatchRequest, Clip, Operation, Project, Track, Transition
from .production.reference import REST_DESCRIPTIONS as PRODUCTION_DESCRIPTIONS

AGENT_INSTRUCTIONS = """Synkinema is a local FFmpeg video editor sharing one project store with the UI.
Read get_agent_guide once; discover capabilities/schema as needed and
read channel_context in get_project/get_edit_context before creating content. Use list_channels/get_channel to select a channel; create_project(channel_id=...) inherits its live editorial guidance. Channel data grants no publishing authority.
get_operation_reference(operation=type) before each unfamiliar edit type.
Prefer browse_projects, get_edit_context, get_work_status and apply_operations(compact=true)
over full inventories/results. Read confirmed revisions; serialize writes. Dry runs do not commit.
On conflict reread and reconcile, never blindly retry. Use clone_project for alternate cuts.
Use typed production tasks, analyze_source_media, plan_narration_cut and audit_edit;
retain task/job IDs, never enqueue to poll. Times are integer ms; source and timeline differ.
For centered subtitles set clip.text_auto_center=true. It centers the whole caption on the canvas, ignoring text_x/text_align; text_y still sets height. text_align=center alone only aligns lines inside the manually positioned block.
Validate before rendering, then inspect actual render_frames and audio by completed job_id.
Metadata/heuristics do not prove visual quality or listening. Full guide: synkinema://agent-guide.
Discover voice providers before TTS; paid/external synthesis needs authorization.
For Script studio, read get_project and edit update_project.script_lines, preserving the full ordered list and stable IDs.
After import_asset/generate_voice_take/prepare_narration, you MUST attach every narration take to script_lines using its real audio_asset_id, audio_source and captured audio_text. Plain script or scenes.voice_asset_id is insufficient. compose_showcase saves these links automatically. MCP validate_project/start_render reject unlinked active voiceover assets.
For requested source-file removal use remove_script_audio: deletes exclusive takes and their script history associations; shared sources are retained.
Changed script-only writes clear line audio associations. get_edit_context omits script_lines; microphone capture is browser-only.
"""


def agent_guide() -> str:
    return Path(__file__).with_name("agent_guide.md").read_text(encoding="utf-8")


def guide_page(section="overview", offset=0, limit=6000):
    guide = agent_guide()
    parts = re.split(r"(?m)^## ", guide)[1:]
    sections = {re.sub(r"[^a-z0-9]+", "-", p.splitlines()[0].lower()).strip("-"): "## " + p for p in parts}
    if section == "overview":
        return {
            "overview": AGENT_INSTRUCTIONS,
            "editorial": "Read the selected channel once before content work. A broad research topic is not permission to violate a one-game-per-film rule: propose separate videos. Never infer exceptions or update channel rules from a template. Preview motion/audio where the client supports it; ASR and stills cannot prove listening/action readability.",
            "sections": [
                {"id": key, "title": value.splitlines()[0][3:], "characters": len(value)}
                for key, value in sections.items()
            ],
            "usage": "Request section by ID, offset and limit (max 12000 characters). section=full pages the complete guide. Full resource: synkinema://agent-guide.",
        }
    if section != "full" and section not in sections:
        raise ValueError("Unknown guide section; call get_agent_guide() for the section index")
    body = guide if section == "full" else sections[section]
    end = offset + limit
    return {
        "section": section,
        "text": body[offset:end],
        "total_characters": len(body),
        "next_offset": end if end < len(body) else None,
    }


def _partial(model, fields=None, exclude=()):
    schema = model.model_json_schema()
    schema.pop("required", None)
    schema.pop("title", None)
    schema["properties"] = {
        k: v for k, v in schema["properties"].items() if k not in exclude and (fields is None or k in fields)
    }
    return schema


def _payload(properties, required):
    # Hoist model definitions so $refs remain resolvable inside the standalone payload schema.
    properties = deepcopy(properties)
    definitions = {}

    def hoist(node):
        if isinstance(node, dict):
            definitions.update(node.pop("$defs", {}))
            for value in node.values():
                hoist(value)
        elif isinstance(node, list):
            for value in node:
                hoist(value)

    hoist(properties)
    result = {"type": "object", "properties": properties, "required": required, "additionalProperties": False}
    if definitions:
        result["$defs"] = definitions
    return result


def operation_reference(operation: str | None = None) -> dict:
    """Payload schemas describe the supported public contract, not arbitrary ignored keys."""
    identifier = {"type": "string", "description": "Existing ID returned by this server; never guess."}
    integer = {
        "type": "integer",
        "minimum": 0,
        "description": "Integer milliseconds on the project timeline.",
    }
    identity = {"track_id": identifier, "clip_id": identifier}
    records = {}

    def add(name, description, schema, example):
        if name in {"add_clip", "append_clip", "update_clip"}:
            description += (
                " For centered subtitles set text_auto_center=true on clip/changes: the renderer centers"
                " all lines, subtitle and editorial dash at 50% canvas width, overriding text_x/text_align."
                " text_y remains adjustable. False restores saved manual positioning; text_align=center"
                " alone does not center a displaced block. Preview and export use the same layout."
            )
        records[name] = {"description": description, "payload_schema": schema, "example_payload": example}

    add(
        "update_project",
        "Shallow replacement of supplied project fields. profile/scenes/script_lines/asset_ids replace their entire values; omitted nested model fields reset to defaults. script_lines synchronize script to newline-joined text; a changed script-only edit clears line audio associations. Line audio must reference an existing, probed audio asset. IDs and revision cannot be changed. Initial line attachment does not insert clips. Replacing an attached take updates its unambiguous whole-take voiceover clips and scene voice references atomically, preserves start/speed/gain, and uses the replacement audio duration. Overlaps reject; no ripple or speech truncation. Trimmed/split/shared-line takes need explicit clip edits before the script update in the same batch. Captions require separate realignment.",
        _partial(
            Project,
            fields={
                "name",
                "brief",
                "script",
                "script_lines",
                "profile",
                "scenes",
                "asset_ids",
                "channel_id",
            },
        ),
        {
            "brief": "A concise wildlife story",
            "script_lines": [{"id": "intro", "text": "A quiet morning in the forest."}],
            "profile": {"name": "Full HD", "kind": "video", "width": 1920, "height": 1080, "fps": 30},
        },
    )
    add(
        "add_track",
        "Append a track; generated ID if omitted. Use video for one primary track, overlay for additional visuals, text for captions; voiceover/music/sound/ambient for audio.",
        Track.model_json_schema(),
        {"id": "sound", "name": "Source audio", "kind": "sound"},
    )
    add(
        "reorder_tracks",
        "Replace ordering using every existing track ID exactly once. No timing changes. Track order affects text/overlay compositing order; this is not merely a UI preference.",
        _payload({"track_ids": {"type": "array", "items": identifier, "uniqueItems": True}}, ["track_ids"]),
        {"track_ids": ["video", "titles", "sound", "voice", "music"]},
    )
    add(
        "remove_track",
        "Remove a track. By default only EMPTY tracks can be removed; nonempty tracks reject. Set remove_clips=true explicitly to atomically remove the track and all its clips, including tracks with more than 100 clips. Source media is retained; restore_revision can undo the edit. Default tracks can also be removed. Confirm the intended track and contents before removing a populated track.",
        _payload(
            {
                "track_id": identifier,
                "remove_clips": {
                    "type": "boolean",
                    "default": False,
                    "description": "Explicitly remove every clip on this track too. Source media is retained. Defaults to false (empty tracks only).",
                },
            },
            ["track_id"],
        ),
        {"track_id": "sound"},
    )
    add(
        "update_track",
        "Change name, muted, ducking or gain_db. muted hides visual/text tracks or silences audio; does not change stored project duration. gain_db (-60..12 decibels, default 0) adds to clip gain/automation on audio tracks before fades/mixing; ignored on visual tracks. ducking acts on this audio track underneath voiceover tracks.",
        _payload(
            {
                "track_id": identifier,
                "changes": _partial(Track, fields={"name", "muted", "ducking", "gain_db"}),
            },
            ["track_id", "changes"],
        ),
        {"track_id": "music", "changes": {"muted": True, "ducking": True}},
    )
    add(
        "add_clip",
        "Append a clip record on an existing track at its explicit start_ms (default 0); does NOT append in time, snap, resolve collisions or extract audio. Omit id to generate one. Reference library asset_id for media; text tracks require nonempty text. Overlay tracks also accept assetless shape clips (rectangle/ellipse/line). placement sets layer position/size; caption_style selects text styling. Full Clip defaults apply. All track kinds reject new overlapping intervals (422), including muted tracks; explicit primary-video transitions are the only intentional overlap. For simultaneous layers choose an unmuted same-kind track free for the entire [start_ms,start_ms+duration_ms) interval, or batch add_track + add_clip. This operation never silently changes the requested start.",
        _payload({"track_id": identifier, "clip": Clip.model_json_schema()}, ["track_id", "clip"]),
        {
            "track_id": "video",
            "clip": {
                "id": "clip_video",
                "name": "Opening",
                "asset_id": "ASSET_ID",
                "start_ms": 0,
                "duration_ms": 4000,
            },
        },
    )
    append_schema = _partial(Clip, exclude={"start_ms"})
    append_schema["properties"]["duration_ms"].pop("default", None)
    append_schema["properties"]["duration_ms"]["description"] = (
        "Omit to use remaining media duration divided by speed (floor ms); images/text default to 4000ms."
    )
    add(
        "append_clip",
        "Append at the end of the target track (0 when empty), never at the global project end. Omit start_ms. If duration_ms omitted, use remaining source duration / speed rounded down; images/text default 4000ms. Source limits still apply. Incoming transition must be cut; set_transition afterwards can ripple aligned media. Provide id to refer to this clip in later batch steps.",
        _payload({"track_id": identifier, "clip": append_schema}, ["track_id", "clip"]),
        {"track_id": "video", "clip": {"id": "appended", "asset_id": "ASSET_ID", "duration_ms": 2000}},
    )
    add(
        "duplicate_clip",
        "Copy clip to optional target_track_id (default source track) with new generated ID or supplied new_clip_id. start_ms defaults to target track end; explicit time allowed. Preserves source trim, speed, fades, effects and animations; resets incoming transition to cut. Source clip is unchanged. Does not copy linked audio/text; use a batch for synchronized copies. Invalid overlaps/track compatibility reject.",
        _payload(
            {**identity, "target_track_id": identifier, "new_clip_id": identifier, "start_ms": integer},
            ["track_id", "clip_id"],
        ),
        {"track_id": "video", "clip_id": "appended", "new_clip_id": "duplicate"},
    )
    add(
        "extract_audio",
        "Copy audio from video/overlay clip to REQUIRED existing audio target_track_id. Requires source has_audio=true. Preserves absolute start, duration, source_in, speed, gain and fades, but removes visual effects/animations/transform and incoming transition. New ID generated unless new_clip_id supplied; source visual stays unchanged and silent. No new asset/file, no persistent link: later trims/moves do not sync the copy. Target must be free for the entire copied interval; repeated extraction onto an occupied track rejects (422). Batch add_track + extract_audio to create a separate simultaneous audio layer.",
        _payload(
            {**identity, "target_track_id": identifier, "new_clip_id": identifier},
            ["track_id", "clip_id", "target_track_id"],
        ),
        {"track_id": "video", "clip_id": "appended", "target_track_id": "sound", "new_clip_id": "extracted"},
    )
    changes = _partial(Clip, exclude={"id"})
    add(
        "update_clip",
        "Shallow replacement of supplied clip fields except immutable id. effects/animations replace entire arrays; transform/transition are rebuilt with model defaults for omitted properties. Read-modify-write complete nested values. Does not retime animations, adjust source bounds, ripple, or snap. All edits validate the final timeline and reject new overlaps on every track kind, including muted tracks. Use dedicated move/trim/transition operations for their side effects.",
        _payload({**identity, "changes": changes}, ["track_id", "clip_id", "changes"]),
        {
            "track_id": "video",
            "clip_id": "clip_video",
            "changes": {"effects": [{"type": "contrast", "value": 1.1, "enabled": True}]},
        },
    )
    add(
        "move_clip",
        "Set absolute start_ms; optional target_track_id relocates the SAME clip. No snapping, copying or audio extraction. Clears moved clip's incoming transition and the next chronological clip's transition on the SOURCE track; validates primary timeline and asset/track compatibility atomically. Moving to audio preserves visual animations, so incompatible properties reject.",
        _payload(
            {**identity, "start_ms": integer, "target_track_id": identifier},
            ["track_id", "clip_id", "start_ms"],
        ),
        {"track_id": "video", "clip_id": "clip_video", "start_ms": 1000},
    )
    add(
        "trim_clip",
        "Apply changes with timing validation. Provide resulting start_ms, duration_ms and source_in_ms yourself; there is no side/delta parameter. Retains incoming transition when start is unchanged; changing start clears it. Always clears next chronological clip's incoming transition. Supply retimed animations and bounded fades yourself; API does NOT reproduce UI trim calculations. No ripple or linked audio movement.",
        _payload({**identity, "changes": changes}, ["track_id", "clip_id", "changes"]),
        {
            "track_id": "video",
            "clip_id": "clip_video",
            "changes": {
                "start_ms": 1000,
                "duration_ms": 3000,
                "source_in_ms": 1000,
                "animations": [],
                "fade_in_ms": 0,
                "fade_out_ms": 0,
            },
        },
    )
    add(
        "set_transition",
        "Primary video track only. Non-cut needs a preceding clip. Use a positive duration shorter than BOTH clips. Sets start to previous end minus overlap (cut: previous end). Shifts ALL clips on ALL tracks, including muted ones, and all scenes whose start >= this clip's OLD start by the same delta. Spanning earlier audio/text stays unchanged; review sync. First clip only accepts cut. Timeline validation is atomic. If ripple creates an audio/text/overlay collision, the entire write rejects (422); use separate tracks or a batch that resolves every collision.",
        _payload(
            {**identity, "transition": Transition.model_json_schema()}, ["track_id", "clip_id", "transition"]
        ),
        {
            "track_id": "video",
            "clip_id": "clip_video",
            "transition": {"type": "crossfade", "duration_ms": 300},
        },
    )
    add(
        "split_clip",
        "time_ms is an ABSOLUTE timeline timestamp. Both pieces must be >=100 ms. Animated clips reject. Original ID remains on left; optional new_clip_id sets a stable right ID, otherwise generated; right source_in advances by (time_ms-start_ms)*speed; right incoming transition becomes cut. Boundary fades are removed and remaining fades clamped. Find new right ID by comparing returned project. Text/image source offsets also advance though unused by rendering.",
        _payload(
            {
                **identity,
                "time_ms": integer,
                "new_clip_id": {
                    "type": "string",
                    "description": "Optional stable ID for the new right-hand clip; generated when omitted.",
                },
            },
            ["track_id", "clip_id", "time_ms"],
        ),
        {"track_id": "video", "clip_id": "clip_video", "time_ms": 2000},
    )
    add(
        "remove_clip",
        "Remove one clip; no ripple and source asset remains in library. Clears next chronological clip's incoming transition on source track. Full primary timeline validation may reject inconsistent pre-existing overlaps.",
        _payload(identity, ["track_id", "clip_id"]),
        {"track_id": "video", "clip_id": "clip_video"},
    )
    add(
        "restore_revision",
        "Copy an existing historical snapshot into a NEW current revision. History is preserved, revision never decreases. Assets and render jobs are not rolled back. Repeated current_revision-1 is not multi-step undo: choose the actual target from list_revisions/history.",
        _payload({"revision": {"type": "integer", "minimum": 1}}, ["revision"]),
        {"revision": 1},
    )
    if operation is not None:
        if operation not in records:
            raise ValueError(f"Unknown operation {operation!r}. Choose from {', '.join(records)}")
        return {"operation": operation, **records[operation]}
    return {
        "contract_version": 2,
        "envelope_schema": Operation.model_json_schema(),
        "batch_schema": BatchRequest.model_json_schema(),
        "operations": records,
    }


# Keyed by FastAPI route function name; tests require coverage for every /api route.
REST_DESCRIPTIONS = {
    "remove_script_audio": "Remove a line's audio and its project media membership at {expected_revision,expected_version,audio_asset_id}. Atomically clears this line/take association from this project's current script, saved revisions and render snapshot script metadata; removes matching asset_ids inventory entries. Script text and timeline remain unchanged. The removed take cannot be restored through undo. Another line or any timeline in this project's current/history/render snapshots using this source blocks removal with 409. Other projects and shared library memberships retain the source; otherwise deletes original/sidecar files with durable cleanup. Returns the confirmed project, deleted asset_ids or retained_asset_id, and actual cleanup metrics. Stale project/asset versions or changed take reject without changes. pending_files means disk cleanup remains incomplete. Not a regular reversible edit operation or batch step.",
    **CHANNEL_DESCRIPTIONS,
    **PRODUCTION_DESCRIPTIONS,
    "export_presets": "Read the shared output catalog: landscape 16:9, Reel/Short 9:16, square 1:1 and feed 4:5 in HD, Full HD, QHD (1440p, marketed as 2K; not DCI 2048), and UHD 4K tiers. Explicit pixel dimensions are authoritative. Also returns CRF quality choices, frame rates and draft cap. No writes.",
    "plan_export": "Read-only export preflight for CURRENT project: POST RenderRequest with expected_revision and optional output {width,height,fps,crf,fit,background,x,y}. Returns resolved encoded settings, intermediate canvas size and source-upscale/crop warnings; does not decode or render. 409 on revision conflict. Cache by project ID, revision and entire request. Fit contain preserves the entire composition with bars; cover crops all layers including captions. FPS increases duplicate frames; no interpolation or AI upscaling. This is geometry guidance, not proof of visual quality.",
    "asset_inventory": "Read the local owner's complete stored-media inventory, including shared, private and history-only sources. Does not share private files or modify memberships. Use /api/assets for collection-scoped results. Asset.version guards metadata edits/deletion; legacy assets start at 1. Includes file metadata, tags, source/license and locations.",
    "asset_usage": "Read current project, historical revision and render-snapshot references for one asset, with project names, revision numbers and job IDs. can_delete is true only when no such references exist; collection memberships alone do not block physical deletion. This is advisory: deletion rechecks usage and expected_version atomically. History references protect undo and cloned projects.",
    "update_asset": "Replace editable media metadata {name,tags,source,license,expected_version}. Requires the confirmed Asset.version; stale version returns 409 without changes. Name is trimmed/nonblank, tags trimmed/deduplicated/sorted (max 50, each 1–100 chars). Immutable ID, original bytes/path/checksum and timeline references stay unchanged. Metadata is global across every collection; response is the updated Asset. No project revision change.",
    "remove_asset_location": "Remove ONE membership with {project_id?,expected_version}; omit project_id for shared library. Retains bytes. Unsharing preserves private memberships for projects that reference the file, including history. Removing a project membership is blocked while its current timeline/asset_ids uses the file. Removing the last collection of an unused file returns 409: use delete_assets instead to avoid orphaned bytes. Wrong version returns 409. Removing an absent membership leaves the asset unchanged.",
    "batch_assets": "Atomically update 1–100 distinct asset_ids. action=add_tags merges supplied tags; remove_tags subtracts only those tags; locate requires destination={project_id?,folder_id?} and adds/moves membership in that scope. Does not replace unrelated tags or other locations. All IDs and final tag limits validate before committing. Missing ID is 404 and saves nothing. No project edits, file copies or physical deletion. Returns updated Asset list, with metadata versions.",
    "delete_assets": "Permanently delete an atomic selection {assets:[{id,expected_version}]} (1–100 distinct IDs). Rechecks ALL current projects, history and render snapshots under the SQLite transaction; any usage, version conflict or missing ID rejects the entire selection. Memberships alone do not block deletion. Removes original bytes and thumbnails from all collections with durable cleanup intent. Returns deleted asset_ids, freed_bytes and pending_files; nonzero pending means disk cleanup remains incomplete and retries automatically/on restart. No force mode or undo. Use remove_asset_location to unshare used files instead.",
    "delete_asset_folder": "Delete one named folder and move its assets to that collection's root atomically. Keeps all files, other memberships, tags and timeline references. Returns folder_id, project_id (null for shared library) and changed assets with updated versions. Missing folder is 404. This removes organization only, never the contained media.",
    "delete_job": "Permanently delete one export and its MP4/partial/mix files. Cancels active FFmpeg and waits for shutdown first. Invalidates this project's inspection artifacts (retained jobs can regenerate them). Returns deleted IDs, freed_bytes and pending_files. Missing job: 404. Never deletes source assets or project edits; no undo.",
    "clear_jobs": "Permanently delete selected job_ids, or clear an entire queue with status=finished (default) or all (also cancels running/queued work). Optional project_id scopes all operations. All matching database rows are included, beyond the 100-job display limit. Exact selection is validated before cancellation; missing/wrong-scope IDs return 404. MP4/partial/mix and inspection artifacts are physically removed. Cleanup intent commits atomically with metadata deletion; pending_files reports disk failures, retried every 10 seconds/restart. Concurrent newly queued work after selection is retained. No undo.",
    "delete_project": "Permanently delete a project at expected_revision, ALL revisions/comments/jobs/private folders and exclusively owned private media files, plus renders and project inspection/unused current-version render caches. Shared library assets and sources referenced by other projects' historical revisions/jobs are retained. Active renders stop first; stale revision returns 409 (jobs may have been cancelled if another client edited during shutdown). Returns deleted IDs and actual disk cleanup totals. Nonzero pending_files means committed deletion with deferred disk cleanup; inspect/retry storage cleanup. No undo.",
    "cleanup_status": "Read pending disk cleanup count from the durable deletion outbox. No filesystem mutation. deleted_files/freed_bytes are zero on this status endpoint. Nonzero pending_files remains visible until unlink succeeds; worker retries every 10 seconds and on restart.",
    "retry_cleanup": "Retry all previously committed file deletions immediately. No new project/job deletion is selected. Returns files physically unlinked, freed_bytes and remaining pending_files. Safe to repeat; missing files resolve pending entries. Waits for in-progress inspection before cleaning its cache.",
    "state_snapshot": "Lightweight synchronization snapshot of project IDs/revisions and render jobs. Studio polls this using TanStack Query; pending optimistic writes take precedence over remote refreshes.",
    "preview_text_layer": "Render a transparent PNG from a candidate clip and output profile, including unsaved optimistic edits. Uses the export renderer's cached typography; does not create a project, revision or render job. Cache by the complete request body.",
    "preview_caption": "Inspect a candidate caption, including unsaved optimistic edits. Returns one cached export-renderer PNG URL and its matching foreground bounds in output-profile pixels. Bounds include wrapping, font size, style, subtitle, stroke and vertical clamping; exclude the editorial contrast gradient. Null bounds mean no visible caption foreground. Cache by the complete clip and profile; bind bounds to the returned raster URL, never to a previous request. Creates only a reusable cache file, no project revision or render job. The raw PNG endpoint remains available.",
    "asset_folders": "List named media folders. Omit project_id for the shared library; use a project ID for its private collection.",
    "create_asset_folder": "Create a named folder in the library or one project. Case-insensitive duplicate names in the same collection are rejected.",
    "rename_asset_folder": "Rename a folder using its stable ID. IDs, collection scope, asset memberships and all timeline references stay unchanged. Returns id and name; duplicates in the same scope reject.",
    "locate_asset": "Add or move an asset to a folder in a collection. Null project_id means shared library; null folder_id means root. Other collections and timeline references stay unchanged. No binary copies or project revision changes.",
    "caption_layer": "Read image/png: transparent text or shape clip layer at project width/height, using the same font, wrapping, safe-area placement and contrast background as final FFmpeg exports. Optional revision pins an immutable snapshot; X-Project-Revision identifies it. Does not apply time-dependent opacity or fades; multiply these during playback. Does not edit the project or render a video. Unknown project/revision/text clip: 404. Pinned responses use private immutable caching; unpinned responses revalidate.",
    "batch": "Apply 1-100 ordered {type,payload} operations with expected_revision in one transaction and one new revision. Final project/assets/timeline validation; any failure rolls back all edits. dry_run=true returns candidate at base_revision+1 but commits nothing; generated IDs provisional. Return {committed,base_revision,applied_operations,project}. Explicit IDs allow later steps to reference created clips. No imports or renders in batches.",
    "clone": "Create an independent project from required {name,revision} source snapshot. New project ID/revision 1, track/clip IDs retained within project, assets shared. No jobs/comments/history copied; source unchanged. Repeating creates another copy.",
    "preflight": "Read cheap structural diagnostics for current/pinned revision: valid, errors/warnings with codes and context IDs/times, counts. Checks source files/references/bounds and primary timeline, warns about gaps/silence/muted tails and legacy_lane_overlap for preserved ordinary overlaps on audio/text/overlay tracks. New or retimed overlaps are rejected by all edit endpoints. Does not render/decode or guarantee final quality. Missing project/revision: 404; invalid project report: 200 with valid=false.",
    "asset": "Read one existing asset by ID with media metadata, has_audio/duration, source/license, tags and relative URLs. Does not decode media. Unknown ID: 404.",
    "health": "Read readiness metadata: version and whether ffmpeg/ffprobe executables are available. Does not perform a render. Exempt from optional bearer authentication.",
    "capabilities": "Read implemented features, effect/property bounds, limits and discovery links. Combine with /api/schema/project and /api/schema/operations; capabilities are not arbitrary FFmpeg support.",
    "read_agent_guide": "Read the packaged Markdown agent operating guide: start here before editing. Includes workflow, units, examples, revision conflicts, audio extraction, inspection and implementation limits.",
    "project_schema": "Read full Project JSON Schema with nested models. Cross-field and property-dependent constraints are explained by capabilities and the agent guide.",
    "operation_schema": "Read descriptions, standalone payload JSON Schemas and examples for every editing operation; optional operation query selects one. IDs in examples are placeholders. Unknown operation: 422.",
    "projects": "Read all persisted projects with tracks/clips, current revision and computed duration_ms. No pagination. Refresh an individual project before editing.",
    "create": "Create a project from a full or partial Project body (name required; other fields have defaults). Generates a new project id and revision 1, returns complete Project and duration_ms. Does not render or synthesize narration. Repeating creates another project. New clips cannot overlap on a single track of any kind; explicit primary-video transitions are the exception (422 on invalid layout).",
    "project": "Read complete current Project, or immutable historical snapshot selected by revision query. Includes duration_ms. Does not restore that revision. Unknown project/revision: 404.",
    "operation": "Apply ONE atomic {expected_revision,type,payload} and return updated Project with incremented revision and duration_ms. See /api/schema/operations for all payload schemas and side effects. Serialize writes; on 409 reread and reconcile. Arrays/nested values are shallow replacements. Helper operations explicitly support append, duplicate and extract_audio; no UI snapping or automatic keyframe retiming. Final validation rejects new/retimed ordinary overlaps on every track, even muted (422); no automatic new track or time shifting. Existing legacy overlap pairs may keep identical timing during unrelated edits; preflight reports legacy_lane_overlap. Missing IDs: 404; invalid values/timeline: 422.",
    "history": "Read revision/operation/created_at records newest first. Use GET project?revision=R for content. restore_revision creates a new current revision; it does not delete history.",
    "voice_status": "Discover speech providers, configuration, model IDs, input limits, language allowlists, preset voices, local/external processing and license links. No download, inference or paid request. Use providers[] and default_provider; top-level provider/configured/input_limit retain their legacy ElevenLabs meaning. Supertonic is an archived pinned local model; configured does not guarantee successful inference.",
    "generate_voice": "Generate speech, not text. Returns {asset,cached} after real audio import. Choose provider=supertonic, voice_id=F1..F5/M1..M5, language=<one of 31 supported ISO codes>, optional steps=4..16 and speed=0.7..2.0; limit 1000 chars. Supertonic runs offline using an explicitly installed pinned model; no na/auto fallback, language detection or translation. Its output must be identified as AI-generated under OpenRAIL-M. Legacy/default provider=elevenlabs requires a real account voice_id and server key, sends text externally and may consume paid credits; authorize that separately. Pass project_id for private media; omit for shared Voiceovers. Never inserts a clip or increments project revision. Duplicate requests reuse existing output in that media scope; language, voice, speed, steps and pinned model revision separate cache entries. Inspect asset duration and add_clip on a voiceover track afterwards.",
    "assets": "Read shared library by default, or private project media with project_id; optional folder_id filters that collection. Private project search includes referenced timeline assets. q is a case-insensitive substring of name/tags, kind is image/video/audio. Returns IDs, actual durations/dimensions/has_audio, URLs, tags, checksums and source/license. No pagination.",
    "upload": "Upload actual media bytes as multipart file (max 2 GiB), tags as JSON-encoded list, optional source/license strings and project_id/folder_id. Omit project_id for shared library; set it for private project imports. Folder must belong to that collection. Returns imported Asset; identical bytes reuse existing metadata and add collection membership. Does not add project clips. Unsupported/corrupt media: 422; too large: 413. Do not send a filesystem path or remote URL as file content.",
    "tags": "Replace all asset tags with a JSON array (not an object). Max 50 strings, each <=100 characters; sorted/deduplicated. Returns Asset. No project revision change. Read and merge first when appending tags.",
    "render": "Queue immutable snapshot of CURRENT project, returning Job immediately (202). Supply expected_revision to reject concurrent changes (409). quality preview caps output at 640 px with CRF 27; final uses profile or optional output {width,height,fps,crf,fit,background,x,y}. Export overrides never edit the project or its revision. Discover /api/export-presets and POST export-plan before enqueueing; job.output records actual settings and job.warnings flags enlargement/cropping. Optional absolute from_ms/to_ms selects an in-bounds range; output time starts at zero. Repeats queue extra jobs. Poll GET /api/jobs/{job_id}; only completed has output_url. Invalid/empty timeline: 422.",
    "jobs": "Read at most the latest 100 jobs, optionally filtered by project_id BEFORE that limit. Each includes revision/status/progress/phase/error/output_url. Keep job_id to retrieve older jobs directly.",
    "job": "Read one persisted Job. progress is 0..1. Poll about every 1-2 seconds with backoff until completed/failed/cancelled; inspect error on failure. Resolve relative output_url against server origin only after completed. No project mutation.",
    "cancel": "Cancel queued/running render and stop its FFmpeg task. No request body. Returns resulting Job; does not undo project edits or delete completed output. Already terminal jobs stay terminal.",
    "events": "SSE stream: data objects contain projects [{id,revision}] and jobs. Heartbeat comments when unchanged, checked about once per second. This is invalidation/progress information, not a replayable edit log; reconnect and refetch project snapshots.",
    "frame": "Synchronously inspect one actual FFmpeg frame. JSON body time_ms is absolute and must be < duration_ms; pin revision for reproducibility. Optional job_id selects the exact completed export and determines revision, including range jobs. Times stay project-absolute inside [from_ms,to_ms); metadata includes job_id/from_ms/to_ms/output_time_ms. Invalid jobs or missing files fail without fallback. Returns revision/time_ms/url and server-local path. May render a full cached preview and take time; does not queue a Job. Fetch url to inspect pixels; path is not a client-local file.",
    "sheet": "Synchronously inspect 1-24 frames via timestamps_ms and optional pinned revision. Optional job_id selects the exact completed export and determines revision. Times stay project-absolute inside the export range. Null/empty timestamps uses default points filtered to the range, or its midpoint if none remain. Invalid jobs or missing files fail without fallback. Returns revision/timestamps_ms/url/server path for actual contact sheet. May render/cache a full preview; inspect pixels instead of only metadata.",
    "audio": "Measure actual audio. Prefer job_id of a completed job from this project; it determines revision, overriding a supplied revision. Otherwise inspect a full preview. Returns measured LUFS/true peak, RMS windows, EBU R128 samples, warnings, map_url/audio_url and server map_path. null loudness means silent/too short. Range-job windows are project-absolute; EBU sample times are output-relative. May be expensive; does not change mix settings.",
    "points": "Read suggested timestamps for current or pinned revision query: video/text clip and transition midpoints, capped at 24. Not scene metadata or exhaustive overlay coverage.",
    "comments": "Read all project review comments including pinned revision/time_ms, message and resolved. Comments can refer to old snapshots. No project revision change.",
    "comment": "Create a review note pinned to revision and absolute time_ms (0..duration inclusive). Nonblank message <=5000 characters. Repeating duplicates the note; no project revision change. Returns comment with id and resolved=false.",
    "resolve_comment": "Mark this project's comment resolved=true. No request body; does not toggle/unresolve or change project revision. Returns comment; unknown ID: 404.",
    "captions": "Download text/plain SRT from text clips at current or pinned revision query, sorted by start. Contains headline plus subtitle. Muted tracks excluded unless include_muted=true. No transcription. X-Project-Revision identifies snapshot.",
}
