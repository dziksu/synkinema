# Canvas drag flicker review — 2026-09-12

Previous work was committed first as `91560fe`. This review covers the subsequent
preview fix only; existing user projects, renders and the API contract were not changed.

## Reproduction and causes

A native pointer drag in the dedicated **QA · Canvas drag stability** project
(`ae7d3ad15fa74d7aafc780c9ec6416b9`) reproduced the issue on the original build:
immediately after releasing a caption, `.preview-caption` contained **zero
images** and its target had `opacity: 0; pointer-events: none`.

Three regression tests failed before the fix:

- Releasing a shape cleared its draft before asynchronous optimistic preparation,
  briefly restoring the previous position.
- Changing caption position unmounted the decoded PNG while the replacement
  request and image load were pending.
- Every placement-only pointer update repeated native media synchronization,
  including pause/seek work unrelated to moving the layer.

## Changes

The preview keeps each released draft through the existing TanStack mutation's
settlement. An older promise can clear only its own gesture; failures reveal
Query's rollback, while Escape cancels a current drag. No extra API writes or
invented revisions are used.

Caption replacements load alongside the last decoded image. The visible image
retains its source coordinates and matching measured bounds, so both translate
together until the new PNG is ready. Typography changes still wait for new
measured bounds. Stale load events and changes of clip identity cannot promote
the wrong image. Every raster request remains a TanStack Query read through the
generated client.

Media synchronization now depends on the actual source URL, playback time,
speed and gain rather than the entire clip object. Moving a layer keeps its
existing decoder; replacing its source still resynchronizes playback.

## Validation

- **137 frontend tests passed**, including five new regression cases covering
  released position/rollback, late save versus a newer drag, decoder stability,
  caption replacement decoding and stale image events. The media case also
  checks that source replacement still resynchronizes.
- TypeScript, production build, Biome and generated API drift checks passed.
- Live browser checks covered caption, shape and video movement, caption style
  changes, resizing with updated bounds, and undo.
- Repeated the original drag on the deployed port **8080**: the existing image
  remained decoded and visible (`opacity: 1`), moved by the pointer delta, and
  retained its target while the next raster loaded. No alert was displayed.
- The rebuilt container is healthy. Existing `0.0.0.0:8080` binding and
  `synkinema_synkinema-data` volume were preserved; no render was active at restart.

The production build retains the existing Vite bundle-size advisory. It does
not affect the completed tests or this correction.
