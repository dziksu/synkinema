# Repository readiness review — 12 September 2026

Reference reviewed: [StructSmith, commit b330b4a](https://github.com/dziksu/StructSmith/tree/b330b4a24faf45f1c9b0e15914a1fcc45d5ee555).
Inspected its CI/container/site workflows, semantic-release configuration and
scripts/tests, README, contribution/security guides, templates and Dependabot.

## Adaptation

| Reference pattern | Synkinema implementation |
|---|---|
| Verify before releasing | Formatting, lint, API drift, Python/Studio tests and build; both architecture container jobs must pass |
| Conventional Commits | Tested major/minor/patch rules, dependency patch releases and PR title validation |
| GitHub Releases + GHCR | Built-in token only; no npm/PyPI publication, protected-branch commits or custom PAT |
| Release retry | Reuse only an existing stable tag on the tested commit; verify the GitHub release exists |
| Multi-architecture image | Native amd64/arm64 CI smoke tests; reusable multi-platform publication with SBOM/provenance |
| Shared build version | Studio, Python package metadata, health, OpenAPI and MCP share the selected image version |
| Contributor documentation | English README, contribution/security/deployment/release guides, roadmap, changelog, conduct, owners and issue/PR templates |
| Dependency maintenance | Pinned action SHAs; npm, Python, Docker and Actions Dependabot entries; compatible release-toolchain grouping |

The reference workflow's release-metadata PR needs a custom token although its
contribution guide says no custom token is required. Synkinema deliberately keeps
generated release notes in GitHub Releases, generates versioned download assets,
and leaves source metadata commits out of automation. Its source development
fallback is documented separately from the actual image release version.

No marketing site or funding destination was copied: Synkinema has neither a
corresponding site build nor an authorized funding account configuration.

## Local verification

- **115 Python tests** passed, including real FFmpeg and version/API/MCP checks.
- **128 Studio tests in 27 files** passed; TypeScript and Vite production build passed.
- **18 release-tool tests** passed, including a complete semantic-release dry run
  against a disposable local Git repository. It selected 1.0.0 and created no tag.
- Biome/Ruff formatting, Ruff lint, generated API drift and `git diff --check` passed.
- Pinned actionlint 1.7.12 accepted the final workflows; YAML and local doc links checked.
- Final **Linux arm64** QA image built as non-root `studio`, with CI version `0.0.0`.
  Real render produced a 180 × 320 H.264/AAC MP4 with matching 1,500 ms streams.
  Rendered frame inspection and MCP initialization passed.
- Live isolated HTTP checks passed for health/version, Studio, logo/favicon,
  Swagger, OpenAPI and project listing on port 18080. The test container was removed.
- Python package metadata, health/OpenAPI and MCP reported the stamped version;
  OCI labels included version, revision, source and license.
- `pip check` passed in the image. Standard `requirements.txt` and
  `requirements-dev.txt` resolve successfully; legacy `.lock` symlinks retain local
  `-r` and runtime `-c` compatibility. Standard names let Dependabot inspect the pins.
- Source/release Compose configurations validate. No Git candidate exceeded 5 MB;
  private data, large media and release build output remain ignored.

Existing test-client deprecation notices and Vite's large-chunk warning remain
non-fatal; this change does not hide them or claim to resolve them.

## Hosted checks still requiring the first push

No GitHub remote, push, remote release, package publication or repository-setting
change was made. Existing projects, the running application and its data volume
were not used for QA or restarted. Existing uncommitted application work remains.

The hosted amd64 job, CodeQL, actual GitHub token permissions, package visibility
and GHCR publication cannot be demonstrated without the real GitHub run. The
workflow is configured for them; local container evidence is arm64. Follow
[the first-push guide](RELEASING.md) for the repository settings and release recovery.
