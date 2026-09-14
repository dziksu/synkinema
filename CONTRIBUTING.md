# Contributing to Synkinema

Use Python 3.12, Node from `.nvmrc`, FFmpeg and ffprobe. Follow the development
setup in [README.md](README.md); root npm tooling and Studio dependencies are
installed separately. Legacy `requirements.lock` and `requirements-dev.lock` are symlinks to the canonical
`.txt` pins. Use the standard names for tooling and Windows checkouts without symlink
support. Dependabot monitors the standard names.
Dependencies are locked in `requirements.txt`,
`requirements-dev.txt`, `package-lock.json` and `apps/studio/package-lock.json`.

## Before opening a pull request

```sh
make format
make check
npm run workflows:check
```

`make check` runs Biome formatting, Ruff formatting/lint, release-tool tests,
local release analysis, generated API drift checks, Python tests with real FFmpeg,
Studio tests, TypeScript checking and the production frontend build.
CI also builds and smoke-tests non-root Linux amd64 and arm64 containers, including
real rendering, MCP initialization, HTTP endpoints and the bundled UI.

For container changes, build a separate QA image and use a disposable data volume.
Do not test deletion against your working media or restart another person's server.

## Architecture rules

1. REST, MCP and CLI edits use the shared domain services. Preserve revision checks,
   transactions, timeline validation and immutable render snapshots.
2. Every web API call uses TanStack Query and the swagger-typescript-api generated
   client. Keep query keys scoped, optimistic changes reversible and project writes
   serialized. See [AGENTS.md](AGENTS.md) and [the API guide](docs/WEB_API_ARCHITECTURE.md).
3. Change Pydantic models, operation documentation and OpenAPI together. Regenerate
   with `npm --prefix apps/studio run api:generate`; never hand-edit generated DTOs.
4. Use the English i18n catalog for interface copy. Preserve user-authored language.
   Desktop editing is the current target; mouse, keyboard and drag-and-drop flows
   must remain usable without an agent.
5. Never present simulated progress or an unverified render as completed. Test the
   real MP4 and its frames/audio when changing rendering behavior.
6. Treat project/media deletion as a persisted operation. Respect shared assets and
   active render dependencies; test physical file cleanup in isolated projects.

## Repository layout

| Path | Responsibility |
|---|---|
| `apps/server/synkinema/` | Python API, MCP, persistence, worker and renderer |
| `apps/studio/` | React editor, TanStack Query, generated HTTP client |
| `tests/` | Python domain, API, concurrency, renderer and integration tests |
| `scripts/release/` | Release selection, publication guards and Node tests |
| `scripts/` | QA, contract generation and example automation |
| `examples/` | Reproduction scripts and source credits; binaries are ignored |
| `docs/` | Architecture, workflows, operating guides and QA reports |

Storage schema upgrades belong in the existing versioned migration path. Never
rewrite an already-shipped migration or assume a fresh database during an upgrade.
For dependency changes, regenerate the appropriate lockfile and run the checks.
Update React/React DOM and their types together; keep i18n and TanStack groups
compatible. Runtime/speech dependencies are pinned in `requirements.txt`; install
dev dependencies against that file, rather than refreshing unrelated versions.

## Commits and pull requests

Use Conventional Commits. The PR title is checked and becomes the commit subject
when squash-merging. Keep one coherent change per PR and describe the behavior,
reason and verification. Include screenshots for visible changes.

| Commit | Release impact |
|---|---|
| `fix: ...`, `perf: ...` | Patch |
| `feat: ...` | Minor |
| `type!: ...` or `BREAKING CHANGE:` footer | Major |
| `build(deps): ...` | Patch for runtime dependencies |
| `build(deps-dev): ...`, `ci: ...`, `docs: ...`, `chore: ...` | None by themselves |

A breaking change takes precedence regardless of the type. Release notes include
features, fixes, performance and runtime/build changes. The Conventional Commits
preset is pinned to 9.x for compatibility with the release-notes generator; upgrade
that toolchain as a group and keep the notes-generation regression test passing.

Release publishing is restricted to the verified GitHub Actions `main` run.
`npm run release` refuses local execution. Use `npm run release:check` to inspect
committed changes locally; it excludes uncommitted work and never accesses a remote.
See [RELEASING.md](docs/RELEASING.md) for first-push setup and recovery.
