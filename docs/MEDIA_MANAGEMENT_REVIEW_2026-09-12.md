# Media management review — 2026-09-12

## Delivered

The shared library has a desktop collection sidebar, named folders, searchable
media grid, type/tag filters, sorting, multi-selection, batch tag addition/removal
and drag-and-drop of selected groups into shared folders. Private media and the
complete local inventory are explicit views. Merely viewing private files never
shares them. All application API calls use TanStack Query and the generated
swagger-typescript-api client.

Manage media is available both in the global library and the editor's Project
media / Library panel. It previews one original at a time, edits name/tags/source/
license, manages shared and project memberships and displays current, historical
and render-snapshot usage. Metadata changes use confirmed Asset.version guards;
conflicts preserve form drafts. Folder deletion moves media to collection root.
Already-present memberships are marked instead of silently moving them to root.

Physical deletion removes selected unused sources and thumbnails from every
collection. Any referenced or stale source blocks the whole selection. Current
projects, all historical revisions and render snapshots protect originals. The
same durable file-cleanup outbox used for project/export deletion reports pending
files and retries failures. Deleting the last owning project also cleans sources
retained only for that project's history after their memberships were detached.

Added seven REST routes and seven equivalent MCP tools (44 tools total), typed
OpenAPI responses/requests, regenerated HTTP client, version semantics and updated
agent operating documentation. Fixed the HTTP adapter: it now retains a conflict's
actual explanation instead of labeling every 409 as a changed project.

## Automated checks

- 99 frontend tests passed (23 files), including new media cache and UI regressions.
- 71 backend tests passed. After the final MCP description correction, the 10
  media-management and agent-contract tests were rerun and passed.
- TypeScript/Vite production build passed.
- OpenAPI/client drift check, Biome and Ruff passed.
- Cache regressions cover optimistic rollback across collections, preservation of
  later queued edits, poll protection, metadata versions, folder removal, sharing,
  physical deletion and usage-cache cleanup.
- Backend regressions cover atomic batch failure, deduplicated tags, stale versions,
  history/render protection, unsharing/private access, original/thumbnail cleanup,
  detached history-owned sources and execution of all seven new MCP tools.

## Browser verification against the Docker application

Desktop viewports: 1440 × 900 and 1280 × 720. Disposable project:
`960596818b8e4fb1bde096d5d982a28a` (removed after QA).

1. Verified shared/private/all-inventory separation and scoped project media.
2. Renamed a QA source, added a tag, changed attribution/license, saved and reopened
   its metadata. Confirmed the saved version through the API.
3. Added a project membership and removed shared membership; the original remained
   accessible privately. Shared the same bytes again through a group folder drop.
4. Added a tag to three selected files; physically dragged the selected group onto
   a named shared folder with a real browser pointer gesture. All three moved/shared.
5. Created/renamed/deleted a shared folder and created/moved/deleted a private folder
   in the editor; every contained source returned to the corresponding root.
6. Inserted a QA image on the timeline. Its usage panel disabled source deletion and
   current-project membership removal. Removed the clip and verified protection
   persisted as history-only usage. Unshared and detached the historical source.
7. Selected that protected source with two unused files and attempted deletion.
   The complete selection rolled back, the dialog remained open and the real
   server explanation named the blocking project/history.
8. Deleted only the two unused QA files through the UI. The success message reported
   15.9 KB freed. Verified both original and thumbnail URLs returned 404.
9. Deleted the disposable project via revision-guarded API. Its detached historical
   source and thumbnail were deleted (7,836 bytes, no pending cleanup).
10. Checked the actual Docker volume: all six QA original/thumbnail paths absent.
11. Played the existing Wanderburg trailer in the media dialog: readyState 4,
    paused false and advancing playback. The grid mounts no native media players;
    the dialog mounts one player. Existing source bytes/metadata were unchanged.
12. Smoke-tested the editor's media insertion, preview, canvas-position controls,
    Elements/Caption toolbar and folder/media management access.

The final baseline comparison preserved all **11 existing projects, 13 exports
and 33 media assets**. Project revisions and every existing asset's name, checksum,
path, memberships, tags, source and license matched the pre-test snapshot. All QA
fixtures/folders were removed; cleanup pending count was zero.

## Practical limits

Sources still referenced by undo history cannot be physically deleted in isolation;
unsharing hides them without breaking restores. There is no force-delete switch.
Private collections organize one local owner's storage and are not multi-user
access controls. Bulk actions accept up to 100 distinct sources per request.
