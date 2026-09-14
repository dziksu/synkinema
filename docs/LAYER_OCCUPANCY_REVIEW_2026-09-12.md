# Canvas layers and track occupancy — 2026-09-12

## Delivered

- Empty preview/stage/timeline background clears clip selection. Layer controls
  preserve selection. Selecting a newly inserted layer reveals its track vertically;
  sticky labels and the ruler are respected without shifting time zero underneath them.
- Preview drops keep the playhead frame. An unmuted track of the same kind is reused
  only when the entire half-open clip interval fits; otherwise a new track is created.
  Visual assets and shapes use overlay tracks, captions use text, tagged SFX use sound,
  tagged voice uses voiceover, and other audio uses music. Full video/audio duration is
  preserved. Images and shapes default to four seconds.
- Elements is a floating palette with clickable and draggable shapes. Multiple
  simultaneous elements/captions allocate independent tracks. A real Chromium drag
  regression caused by disabling pointer events on the drag source was found and fixed.
- Source selection stays beside the timeline preview on desktop. A range dropped
  there preserves source trim and aligns both visual/audio copies, finding free tracks
  without shifting the requested timestamp. Explicit track insertion instead finds a
  common subsequent gap for both copies. The drag handle precedes the other actions.
- Timeline moves, trims, keyboard nudges, inspector timing and explicit media/range
  insertion respect neighbors on every track type. Numeric fields reconcile clamped
  values even when the effective value is unchanged, while preserving focused drafts.
- Every API create/edit validates final occupancy, including muted tracks. New or
  retimed ordinary overlaps reject atomically with 422. Explicit primary-video
  transitions remain supported; a transition ripple cannot create collisions elsewhere.
  Batches may resolve intermediate collisions before final validation.
- Historical audio/text/overlay overlap pairs remain readable/renderable/restorable.
  Unrelated edits can retain identical legacy timing; preflight reports
  `legacy_lane_overlap`. Existing user data was not automatically retimed.
- Preview insertion uses the existing TanStack Query project mutation queue and
  generated swagger-typescript-api client. Track creation plus insertion is one atomic,
  optimistic, undoable edit. Rapid queued drops see preceding optimistic layers;
  failures roll back dependent edits. OpenAPI, MCP descriptions, capability notes and
  agent/manual documentation describe the rule and agent batch workflow.

## Automated verification

- Final frontend suite: 112 tests passed across 25 files.
- Backend suite: 86 tests passed. After documentation updates, 22 focused
  contract/occupancy tests passed again.
- TypeScript/Vite production build, generated contract drift check, Biome, Ruff and
  `git diff --check` passed. Vite still reports the existing main-bundle size warning.
- Regressions cover frame quantization, entire-interval availability, muted/full tracks,
  layer limits, malformed drops, selected source ranges, shared audio/video gaps,
  rapid optimistic additions/rollback/revisions, deselection, palette reopening,
  inspector reconciliation and all track kinds' interval boundaries.
- Backend tests cover low-level create/add/update, move/trim, final batch validation,
  legacy repair/clone/restore, repeated audio extraction and rejected transition ripple.
  FFmpeg pixel tests render a transparent logo and a shape on separate overlay tracks.

## Browser and export verification

Tested the deployed Docker app in the in-app Chromium browser at 1440 × 900 and
1280 × 720. Temporary viewport overrides were reset afterward.

Disposable project: `702d5589608f49678f5a16a490d17b9b` (removed after verification).

1. Clicked Rectangle, dragged Ellipse from the palette, reopened it and added Line.
   Each simultaneous shape occupied a separate Elements track. Palette dragging and
   subsequent reopening worked after the pointer-events fix.
2. Added two simultaneous captions; the second used Captions 2.
3. Dropped the 1480 ms tagged bell sound onto the preview; it used Sound effects at
   the current frame with conservative gain.
4. Selected source In 2.0 s / Out 3.5 s, then dropped video+audio at timeline 4.0 s.
   The first drop reused free Elements 2 / Sound effects intervals. Repeating the drop
   reused another free visual layer and created Sound effects 2. Both copies retained
   source_in_ms=2000 and duration_ms=1500. Undo removed the pair and new track; redo
   restored the complete insertion.
5. Dropped the whole eight-second source at timeline 2.0 s. It created Elements 4,
   start_ms=2000, duration_ms=8000, without truncating or appending.
6. Verified empty preview background deselection, safe selection behind sticky timeline
   labels, and an attempted six-second ellipse duration clamped to four seconds before
   the following clip. The inspector displayed the effective saved value.
7. Exported revision 19 as a 10.0-second, 640 × 360 final MP4. Browser playback reached
   the end without media errors. Inspected its actual FFmpeg frame at 2000 ms: primary
   image, independent shapes, captions and video overlay were composed correctly.

Export QA job: `0ba30003140449d09c49884d093ea101` (removed after verification).

## Cleanup and preservation

Deleted only this QA project and its artifacts: 11 files, 16,281,367 bytes reclaimed,
zero pending cleanup entries. The MP4 and inspected frame URLs then returned 404.
The original 11 project documents and 13 job records matched the baseline exactly;
existing export URLs remained available. All 33 source files existed and matched their
stored SHA-256 checksums. No original media was deleted.

The existing project-deletion protection code added private reference memberships to
two still-shared assets (bunny-las.mp4 and hamster.jpg) for other projects already using
them, incrementing their asset versions. All prior memberships and other source
metadata remained unchanged. This was reference bookkeeping, not a source-file edit.

One existing project has a legacy voiceover overlap. It remains preserved and is
reported by preflight; new overlapping timing cannot be added through the API.
