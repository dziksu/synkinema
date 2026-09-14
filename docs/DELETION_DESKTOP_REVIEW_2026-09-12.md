# Render queue and project lifecycle — 2026-09-12

Implemented desktop render list/search/status filters, individual/bulk deletion,
clear finished/all scopes, one bounded preview player, metadata/download/inspection
controls, physical cleanup feedback and persistent retry status. Project cards
now provide edit-name/brief and permanent-delete dialogs. All web requests use
TanStack Query plus the generated swagger-typescript-api client. OpenAPI and the
37-tool MCP contract describe side effects, revision conflicts, scope and cleanup.

## Verified behavior

- Backend tests: clear 103 finished exports beyond the 100-item display limit;
  retain queued jobs for finished-only clearing; delete queued jobs for all;
  reject mixed missing/existing selections without deleting any item.
- Actual file tests: MP4/mix files, project preview/inspection files and exclusive
  private source/thumbnail removal. Historical references in a clone and shared
  library sources survive. Unused current-version caption caches are removed;
  shared caption caches survive until their last project is deleted.
- Active renderer cancellation waits for shutdown and even a simulated late
  write; the worker remains alive afterwards. In-flight inspection completes
  before deletion, so it cannot recreate a removed artifact.
- Simulated disk permission failure persists cleanup intent, reports a nonzero
  pending count and can be retried by a new application instance. A simulated
  database transaction failure preserves project/job rows and source files.
- Browser: filtered and selected only the two newly-created QA exports, confirmed
  deletion and observed a 12.2 KB actual cleanup result. Edited the QA project's
  name/brief to revision 3. Added one more preview, private PNG and frame; deleted
  the QA project through its card and observed 34.5 KB freed. Global Clear queue
  confirmation was inspected and cancelled, preserving existing user exports.
- Direct API and container filesystem verification: all three QA exports, private
  PNG, thumbnail, frame and project are gone. Cleanup pending count is zero.
  All 11 pre-existing project IDs and 13 export IDs remain. Runtime OpenAPI equals
  the checked-in generated contract.
- Browser testing found and fixed a nullable collection scope bug: invalidating
  shared library queries could send `project_id=null`. A regression test now
  requires null/undefined to share one key and omit the HTTP query parameter.
- Added route-change scroll reset and compact desktop header/filter layout.
  At 1280×720 both list and preview controls fit (preview bottom 706px); at
  1440×900 the preview ends at 868px. No horizontal overflow at either size.
  Only one video element is mounted; native playback starts with readyState=4.
  The two-column layout also supports narrow desktop windows down to 800px.

## Automated checks

89 frontend tests passed. The complete backend suite of 63 passed, followed by
passing tests for two additional deletion race/rollback cases (65 backend cases
in total). Updated MCP deletion execution tests also pass. TypeScript/Vite build,
Biome/Ruff format/lint, generated API drift check and `git diff --check` pass.
Existing advisories: Vite's main JS chunk exceeds 500 KB; Starlette emits two
upstream deprecation warnings. Neither blocks the build or tests.

Only disposable data created during this review was deleted. No existing user
project or export was used for destructive tests. Colima's existing data volume
was preserved throughout deployment.
