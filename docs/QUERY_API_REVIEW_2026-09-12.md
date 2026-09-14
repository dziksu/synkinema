# API / Query verification — 2026-09-12

Implemented the mandatory web data flow: TanStack Query options → generated
swagger-typescript-api client → typed FastAPI contract. The durable rule is in
AGENTS.md; the maintenance workflow is in WEB_API_ARCHITECTURE.md.

Validation completed:

- 81 frontend tests and 58 backend tests passed.
- All 16 optimistic edit predictions match deterministic examples produced by
  the actual backend, including fractional-speed split rounding.
- Delayed-response tests cover rapid queued edits, cancellation, de-duplication,
  multipart uploads, confirmed revisions, offline rollback, 409 conflicts,
  dependent edit cancellation, metadata concurrency and stale project lists.
- Boundary tests forbid direct web HTTP access outside the generated transport
  and Query layer. CI regenerates the contract/client/defaults/parity cases into
  a temporary directory and rejects drift.
- TypeScript/Vite production build, Biome, Ruff and git diff checks passed.
- Deployed OpenAPI equals the checked-in generated contract exactly. Live health,
  projects (11), shared assets (32), folders (5), jobs (13) and state returned 200.
- Manual desktop UI test: create project; Bold caption; edit heading/subtitle/
  size; undo and redo; drag caption on canvas; create and rename a private folder;
  add and resolve a review note; reload; queue export; inspect and reopen cached
  export frames. No console errors in the final browser session.

QA project: `24186fd3ebda4310962027727eee3a49`, “QA • Query cache & optimistic editing”,
revision 8. Preview export `1468be0f7c0445c3b35788abf3191a5c` completed at 360×640,
3 seconds. Its actual MP4 contact sheet was inspected in the UI. Existing user
projects and the Docker data volume were preserved.

The live test caught one older render lacking `metadata.audio_duration_ms`, which
caused typed jobs/state responses to fail. Legacy metadata now yields null for
that unmeasured value; a regression test covers global job and state endpoints.

Build output retains a Vite chunk-size advisory (~560 kB uncompressed main JS);
Python tests report two upstream Starlette deprecation warnings. Neither is a
failed check. Native `/media/*` playback uses browser streaming; API-backed PNGs
and SRT downloads use Query, with Blob URL cleanup.
