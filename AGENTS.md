# Synkinema project rules

## API access — mandatory architectural invariant

All web application API requests MUST flow through **TanStack Query** and the
**swagger-typescript-api generated HTTP client**. This is an explicit user
requirement. Preserve it in every feature, refactor and agent contribution.

- Backend FastAPI/Pydantic + the shared operation catalog define the contract.
  Maintain request/response types, stable operation IDs, errors, units, examples
  and side effects in OpenAPI whenever changing an endpoint.
- Run `npm --prefix apps/studio run api:generate` after contract changes. Commit
  the generated schema, defaults and client together. Never hand-edit generated
  files or duplicate backend DTOs manually. `api:check` must pass in CI.
- UI components use `src/api/queries.ts` query options and `mutations.ts` or
  `projectMutations.ts` mutation options. No direct `fetch`, Axios, EventSource,
  arbitrary HTTP helpers or generated client calls in components or stores.
  Imperative reads use `queryClient.fetchQuery`/`prefetchQuery`; writes use
  TanStack mutations. POST inspection and raster generation are cached reads.
- Centralize query keys; include every scope, revision and request parameter.
  Forward Query's AbortSignal to the generated client. Handle errors visibly.
- Optimistically project reversible edits; reconcile server responses and roll
  back on failure. Cancel competing reads. Preserve later independent changes
  when a mutation fails. Never let a poll overwrite pending projections.
- Serialize project writes with the last **confirmed server revision**. Never
  fabricate revisions or blindly retry writes. On failure/conflict, roll back
  dependent queued edits, refetch and let the user reconcile. Preserve undo.
- Render/upload/TTS pending state must be honest: never invent decoded metadata,
  playable assets, completed renders or provider success. Use mutation state for
  progress and promote server-validated results into cache.
- `/media/*` browser image/audio/video streams and links opening documentation
  are not application API calls. API rasters and SRT downloads still use Query.
- Add regression coverage for new cache keys/invalidation, optimistic failure,
  concurrency, revision conflicts and generated contract changes.

Read [docs/WEB_API_ARCHITECTURE.md](docs/WEB_API_ARCHITECTURE.md) for implementation
and maintenance details. `apiArchitecture.test.ts` enforces module boundaries.

## Product and workspace

- For SpawnBrief video production, read
  [examples/spawnbrief/EDITORIAL_RULES.md](examples/spawnbrief/EDITORIAL_RULES.md)
  before scripting or composing. It records the owner's current hook, CTA,
  narration, caption and no-burned-in-AI-footer preferences, superseding older
  calendar examples. Preserve source provenance and publication requirements.

- Desktop editing is the current priority. Default UI language is English; add
  product strings through the i18n catalog. User-authored content may be Polish.
- Preserve existing uncommitted work and users' projects/media. Test destructive
  or exploratory edits in a dedicated QA project.
- Colima hosts Docker. Preserve the `synkinema_synkinema-data` volume.
- Format TypeScript/React with Biome and Python with Ruff. Run relevant tests,
  typechecking/build and codegen verification before finishing API changes.

## Repository and release workflow

- `make check` is the shared local/CI gate. Root npm dependencies are release
  tooling; install them separately from `apps/studio`. Python development uses
  `requirements-dev.txt`, which includes the runtime/speech lock.
- Keep Conventional Commit subjects and PR titles. `npm run release:check` is
  local read-only analysis; `npm run release` is guarded GitHub Actions publication.
  Do not push, publish, create remote releases or change repository settings
  without the user's authorization for that action.
- Releases must wait for code/API verification and both container smoke tests.
  Preserve exact tag/commit checks, retry behavior, and protection against moving
  `latest` backward. Do not introduce auto-commits to protected `main` or a PAT
  requirement for the normal release path.
- Image version stamping happens only in build output. Keep health, MCP, Python
  package metadata, Studio and release artifacts on the same selected version.
- Read `docs/RELEASING.md` before changing release tooling. Pin GitHub Actions to
  verified full SHAs and retain local tests for commit rules and generated notes.
