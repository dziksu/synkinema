# Canvas and media collections review — 2026-09-12

Desktop implementation inspired by the supplied editor references: direct layer manipulation, layout presets, caption presets, elements, private project media and named shared-library folders.

## Delivered

- Separate canvas placement and crop anchors, including pointer movement, proportional/free corner resizing, keyboard nudging, center/edge snapping, Escape cancellation and one revision per completed gesture. Media dropped on the canvas uses the pointer's normalized position.
- Full frame, picture in picture, top/bottom and left/right half presets. Rectangles, ellipses and thin rectangular lines; transparent PNG/video overlays. Placement is static; existing animations still animate crop zoom/anchors and opacity.
- Editorial, Bold hook, Subtitles and Minimal caption styles, with editable text X/Y, size, subtitle and color. Preview and export share text rasterization.
- Project media and Library tabs; project-only imports; explicitly shared membership; named folders, creation, renaming, drag-and-drop and equivalent selects. A floating folder list keeps source thumbnails available during dragging. Collections share source bytes without altering existing timeline references.
- Four new MCP tools and REST routes, scope-aware search/import, published schema and updated agent/manual documentation. LAN-safe IDs also fix creation of source-audio tracks over plain HTTP.
- Adaptive desktop timeline height reserves usable media/preview space at 1280 × 720.

## Verification

- 55 frontend tests, 54 backend tests passed. TypeScript/Vite build, Biome, Ruff and git whitespace checks passed.
- Real FFmpeg pixel checks: primary placement, alpha PNG over a background, alpha with brightness, shape placement, four caption styles. Existing renderer, audio, transitions and inspection tests also pass.
- REST/MCP tests cover private import isolation, deduplication across collections, invalid cross-collection folder IDs, rename stability, legacy migration and the 34-tool discovery contract.
- Manual LAN browser review at 1280 × 720 and 1440 × 900: create project, add source video, apply picture-in-picture/full-frame, add/move/resize ellipse, choose caption presets and edit Polish text, create/rename private folder, drag file onto canvas and between folders, undo/redo, inspect export frames and start MP4 playback.
- Private marker does not appear in shared-library search. Shared Sound effects contains 16 assets, Voiceovers 5, Music 2 after organizing the existing narration/transition fixtures through MCP.
- Demonstration project: `b59f4a5304154235a0b357ff1ca41e61` / **QA • Canvas & collections**. Final export job `f66c178bacf44fa3ac234e32949ad298`, revision **28**, 1080 × 1920, **8 seconds**, completed. Contact sheet inspected from that exact MP4; captions, colored ellipse, positioned transparent marker and source video are present.

## Environment recovery

Disk exhaustion interrupted the initial full test/build. At the user's request, Colima was stopped, its downloaded cache pruned and the VM restarted. Docker prune reclaimed 13.21 GB; filesystem trim returned freed blocks to the host. Named volumes were preserved, including `synkinema_synkinema-data`. Full tests were rerun and the updated container became healthy.
