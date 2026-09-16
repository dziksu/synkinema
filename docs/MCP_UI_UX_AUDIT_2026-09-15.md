# MCP and Studio UI/UX audit — 2026-09-15

## Scope

The audit covered the MCP `initialize` and `tools/list` contract for all 72 tools,
the shared operation/request schemas, and the Studio projects, integrations and
empty editor flows in a real browser. Browser checks used an isolated data store,
not the owner's projects or media.

## MCP findings and changes

- Every tool already had a substantial purpose/result/side-effect description and
  MCP safety annotations. The missing layer was parameter-level guidance for many
  scalar inputs.
- Reusable schemas now explain where project, channel, asset, folder, render-job
  and production-task IDs come from; revision inputs state the conflict/reconcile
  rule; timeline inputs identify integer milliseconds and their coordinate space.
- Render quality is now an explicit `preview | final` enum in MCP discovery rather
  than an unconstrained string. Search/import/filter and destructive-operation
  inputs include scope and provenance guidance at the argument itself.
- Batch and compact agent helpers now document ordering, pagination, source versus
  timeline time, wait IDs and heuristic thresholds in their JSON Schemas.
- The MCP contract test rejects any new top-level scalar argument without a
  description and asserts the render-quality enum. The generated OpenAPI artifacts
  were refreshed because shared Pydantic descriptions also changed.

## Studio findings and changes

- At 390 × 844 the empty editor previously produced a 453 px document, causing
  global horizontal scrolling. Media, preview and inspector now stack at the phone
  breakpoint; the verified document width is 384 px in a 390 px viewport.
- Dense editor controls used 9–10 px text and several 18–28 px targets. Frequently
  used labels, fields, filters and toolbar controls now use a more readable baseline,
  with larger icon targets on small screens.
- Keyboard users can skip the persistent workspace sidebar. The current workspace
  destination is exposed with `aria-current`, the navigation has an accessible name,
  and fields/sliders/resizers receive a visible focus ring.
- Desktop 1440 × 900 remains a three-pane editing surface with no document-level
  horizontal overflow. All rendered buttons retained accessible names.

## Verification

- Full backend suite: 169 passed; Ruff format and lint passed.
- Full Studio suite: 207 passed; API code-generation drift check and production
  build passed.
- Release tooling: 20 passed; read-only release analysis passed.
- Browser QA passed at 1440 × 900 and 390 × 844, including keyboard focus on the
  skip link, current-page semantics, named controls and overflow measurements.
- The aggregate `make check` currently stops before those stages because the
  unchanged `scripts/release/plan.mjs` on the base branch fails Biome formatting.
