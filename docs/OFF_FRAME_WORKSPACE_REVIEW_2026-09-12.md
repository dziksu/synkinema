# Off-frame editing and responsive preview — 2026-09-12

## Behavior

The desktop preview keeps placed images, videos and shapes visible beyond the output frame. A pointer-transparent exterior wash shows that region at 32% of its original contribution against the workspace background. The frame interior retains the original colors and opacity. A single composition is used, so videos have one decoder and one playback clock. Elements and corner handles remain hit-testable outside the frame. Overflow is contained by the editor workspace, keeping adjacent panels and transport controls usable.

Preview zoom offers Fit, 75%, 50% and 25%. Zoom affects only the local workspace view; zooming out exposes distant handles on oversized layers. Existing normalized placement, drag drafts, snapping, keyboard controls, one commit per gesture, Undo and optimistic project mutations are preserved. Output rendering continues to crop to the project frame.

The canvas now sits outside normal layout flow, centered in the preview stage. Its previous expanded dimensions cannot impose a minimum size on the docked panel. `usePreviewSize` measures available content space before paint and responds to ResizeObserver, window resize and fullscreen changes. It preserves the profile aspect ratio, applies the chosen zoom, handles hidden/zero-size panels and ignores callbacks from superseded observers. The frame and its interaction targets share the same fitted dimensions.

## Validation

- Production TypeScript/Vite build and Biome passed. All 123 frontend tests passed, including new sizing lifecycle and off-frame drag/resize regressions; 11 relevant Python renderer/caption tests passed.
- Native desktop UI tests used a disposable project containing a private generated 4-second video, red/blue rectangles and a yellow ellipse extending beyond all four frame edges. Outside parts visibly dimmed; inside parts retained full color.
- Clicking and dragging solely on the red rectangle's outside portion selected it and moved it into the frame. Undo restored it. Its outside northwest handle resized it from 40% to approximately 52.65% frame width. Grabbing the video's dimmed upper portion moved it into the frame as well.
- Fit/50%/25% changes retained one video element. The video decoded at 320×180, played through to 4 seconds, and remained muted as an overlay. No browser console errors were recorded.
- Repeated expand/close and window resizing passed at 1280×720, 1440×900 and 1680×1050. Measured frame sizes matched the computed fit within one CSS pixel and stayed inside the stage. At Fit, examples were 158.0625×281 px (1440×900 docked), 381.375×678 px (1440×900 expanded), 124.3125×221 px (1280×720 docked), 280.125×498 px (1280×720 expanded), and 465.75×828 px (1680×1050 expanded). Changing size while expanded and returning to the docked editor also passed.

The QA project finished at revision 6: only actual edit/undo gestures incremented the revision, while view zoom/expansion/window changes did not. It and its private source were deleted after verification, with the source URL returning 404. All 11 pre-existing project documents, 33 media records and 13 export records matched the pre-test snapshot; pending file cleanup was zero and the deployed service was healthy.
