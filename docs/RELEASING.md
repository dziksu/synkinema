# CI, releases and the first push

The implementation follows the useful parts of
[StructSmith at b330b4a](https://github.com/dziksu/StructSmith/tree/b330b4a24faf45f1c9b0e15914a1fcc45d5ee555):
Conventional Commits, verification before release, a reusable GHCR workflow,
versioned multi-architecture images, retry handling and community documentation.
It is adapted to Python/React/npm, not Bun.

Synkinema uses only the built-in `GITHUB_TOKEN`. After all checks pass, it uses
semantic-release to calculate the next version and opens or updates a
release-metadata PR. That PR contains the generated `CHANGELOG.md`, matching
application/package versions and regenerated API metadata. With the repository
rules below, the bot queues an automatic squash merge after dispatching the required
checks. A passing PR merges into protected `main` and creates the version tag,
GitHub Release and GHCR image. The source changelog is therefore the canonical,
version-by-version release record.

## First push preparation

No remote is needed for local checks. No push or external publication is performed
by `make check` or `npm run release:check`.

1. Run `npm ci --ignore-scripts`, install Studio/Python dependencies as in the
   README, then run `make check` and `npm run workflows:check`.
2. Review and commit the intended files with Conventional Commit subjects. Keep
   `.env`, `.data`, private media and example outputs out of Git. The initial
   release should have a `feat: ...` commit describing the editor's capabilities.
   Existing `fix:` commits also qualify for an initial release.
3. When ready to publish, create an empty repository under the intended account
   and set its default branch to `main`. Documentation uses `dziksu/synkinema`;
   change those links and the default release Compose image if the final name
   differs. Workflows derive repository/image identity from `github.repository`.
4. Allow GitHub Actions and the pinned actions used by the workflow. In **Settings →
   Actions → General**, enable **Allow GitHub Actions to create and approve pull
   requests**. The release-PR job requests `contents: write`, `pull-requests: write`
   and `actions: write`; the final release job needs `contents: write`, while GHCR
   needs `packages: write`. Organization policy must permit those scopes. No PAT or
   custom secret is required. Tag rules must allow the workflow to create `v*` tags.
   No branch bypass is needed.
5. Add the remote and push only when ready. A releasable push to `main` runs the
   complete verification pipeline, then opens a release PR. Once the required
   checks pass, automatic merge runs the release pipeline and publishes the
   version. With no previous stable tag, semantic-release selects **1.0.0**.
6. After the first GHCR publication, check the package's visibility. New packages
   can default to private; make it public in GitHub Packages if anonymous pulls
   are intended. Public examples work only after this setting and publication.

Repository settings cannot be applied by files in this checkout. Before enabling
automatic release merging, create an **active branch ruleset** for `main` that
requires pull requests and successful checks, blocks force pushes and deletion,
and has no bypass. Enable **Allow auto-merge**, allow squash merging, set the
squash commit subject to the PR title, and disable merge commits and rebase
merging. The generated `chore/release` title should be retained for traceability.
The ruleset must require all five checks below; the workflow verifies those active
rules through the GitHub API before it can queue auto-merge. Requiring a human
review or CODEOWNERS approval also applies to the bot PR and therefore pauses
automatic publication until a maintainer approves it. Do not enable merge queue
without adding `merge_group` support to CI. GitHub Free supports these branch
rules and auto-merge in public repositories; private repositories need a plan
that includes them. Until those settings are available, the release PR stays open
for manual merge after the checks pass; the workflow emits a warning. After merge,
the workflow verifies the committed version
metadata before publication; it does not rely on the merge strategy or title
alone. The release PR's CI and title check are dispatched explicitly, so they
do not depend on approval of the `GITHUB_TOKEN`-created PR workflows. Use these
check names:
**Verify code and API contract**, **Studio tests and build**,
**Container (linux/amd64)**, **Container (linux/arm64)** and
**Conventional PR title**. CodeQL runs separately
for public repositories; private repositories need
GitHub Code Security and the `ENABLE_CODEQL=true` repository variable.
Enable private vulnerability reporting in Settings → Security for the advisory
link in `SECURITY.md`. Dependabot uses the checked-in configuration automatically.

## Pipeline

| Stage | Behavior |
|---|---|
| Verify | Formatting, Ruff, release-tool tests, dependency consistency, API codegen drift and Python tests |
| Studio | Independent React tests, TypeScript check and production Vite build, even if Python tests fail |
| Containers | Native Linux amd64/arm64 builds; real FFmpeg render, MCP handshake, non-root/version checks, live HTTP/UI smoke test |
| Release PR | Runs only after Verify, Studio and both container builds succeed on `main` in a non-fork repository; semantic-release calculates the next version and creates or updates `chore/release` |
| Release metadata | The PR updates `CHANGELOG.md`, root and Studio manifests/lockfiles, Python and Docker defaults, then regenerates and commits the OpenAPI schema/client; CI and title checks are dispatched explicitly, and auto-merge waits for the active ruleset's required checks |
| Semantic release | Runs only after the release PR is merged; verifies the committed metadata, creates `vX.Y.Z` and GitHub release notes/assets |
| Publish image | Called directly with the tested release-PR merge SHA and selected version; verifies tag identity, builds both architectures and publishes GHCR with SBOM/provenance |
| Local launcher | Native macOS/Linux arm64/x64 builds are checked in CI; after image publication, verify all four artifacts/tag/commit and upload the version-matched installer and SHA-256 manifest to that release |
| CodeQL | Separate Python/JavaScript security analysis on PRs, main and weekly |
| PR title | Validates Conventional Commit syntax without evaluating the title as code |

PRs never receive publishing credentials. Main runs are serialized and not
cancelled halfway through publication. New PR commits cancel superseded runs.
The release workflow is invoked through `workflow_call` because tags created with
`GITHUB_TOKEN` do not trigger a second workflow. All third-party actions are pinned
to full commit SHAs; Dependabot maintains them. CI image caches are best effort.
The release build does not export a second cache after pushing image tags, so a
slow cache service cannot hold a successful publication open.

## Version and image identity

Release assets include a version-pinned Compose file, the matching OpenAPI document,
a source/version manifest and license notices. They are generated into ignored
`.release/` during preparation; source files remain unchanged.

`local-helper.yml` builds standalone PyInstaller executables using the small pinned
`requirements-local.txt` dependency set. The builder stamps only a staged package.
Each target records version/repository/commit and SHA-256; assembly rejects mixed,
missing or modified artifacts. The existing exact-tag image guard runs again
before upload. Launcher assets publish only after the matching image succeeds;
an older release retry uploads to its own tag without changing `latest`.
`make check` includes installer/gateway regression tests; the container CI smoke
additionally launches a compiled host helper outside the checkout with a disposable
volume and test CLI. Real account inference remains a separate local check.

Stable tags are `vX.Y.Z`. Images receive `vX.Y.Z` and `sha-FULL_COMMIT_SHA`; the
current latest release also receives `vX.Y` and `latest`. Re-running an old release
does not move the latter aliases backward. No prereleases or maintenance branches
are currently configured.

The release PR is the single source update for the selected version: root and
Studio `package.json`/lockfiles, `synkinema.__version__`, Docker defaults,
`CHANGELOG.md`, the OpenAPI schema and generated Studio client all agree. The
published image is then built from that verified commit with `APP_VERSION` set to
the same version. The frontend receives it at build time; the Python image stamps
its build output and setuptools metadata. Health, OpenAPI and the MCP initialize
response all use the selected version. CI deliberately stamps `0.0.0` to prove the
image override works. Source API drift checks run before image-only stamping.

The build records OCI source/version/revision labels, SBOM and provenance. The
publication job summary includes the pushed manifest digest. Use a digest to pin
an exact artifact; a rebuilt version tag can have a different digest if its base
image or OS package repository changed. Node/Python application dependencies use
lockfiles; base-image and OS security updates are intentional rebuild inputs.

## Recovery

- **Verification/build failure:** fix it and push the change. The release PR is not
  opened when a required verification job fails, and its separately dispatched CI
  must be green before automatic merge.
- **Release PR cannot be created or updated:** enable GitHub Actions permission to
  create pull requests and confirm the workflow token scopes in repository or
  organization settings. The workflow never falls back to committing on `main`.
- **Release PR remains open:** check the five required statuses, the active `main`
  ruleset and repository auto-merge option. The release job skips auto-merge if the
  option or required rules are absent; it never merges an unprotected branch merely
  because CI was dispatched. A required human review must be provided separately.
- **Image publication fails after the release exists:** rerun the failed image
  job, or rerun the workflow for the same commit. The release runner reuses only
  a single stable tag pointing at that exact SHA. It never chooses an unrelated
  latest tag or increments the version just to retry the image.
- **Tag exists but GitHub Release creation failed:** inspect that exact tag and
  commit in GitHub. Complete the missing release for that tag in the GitHub UI
  (use generated release notes), then rerun the workflow for the same commit.
  The runner intentionally stops rather than treating an unverified tag as a
  completed release. Check the release assets too if their upload was interrupted.
- **No releasable commits:** no release PR, version or image is published. `docs:`,
  `ci:` and development-tool-only updates do not release by themselves.
- **403 from GitHub/GHCR:** check organization Actions policy, tag restrictions,
  workflow token permissions and package Actions access. An old package created
  outside this repository may need its repository access connected explicitly.

Never delete a successful release tag to force an increment. Do not announce an
image until the publication job succeeds: GitHub release notes can exist before
container publication completes.

## Local evidence

`npm test` exercises real commit analysis and release-note generation, major/minor/
patch selection, release-metadata updates, publication guards, tag retries and
alias protection. A complete semantic-release dry run in a disposable local Git
repository verifies the first release is 1.0.0 without creating a tag. It has no
GitHub plugin or network remote.

`npm run release:check` analyzes the real checkout's committed history without
invoking the publishing engine. Docker smoke tests use an isolated container and
never mount the working project's persistent volume. Local and hosted checks have
different environments: remote permissions, GHCR publication and both hosted
runner architectures can only be confirmed by the first real GitHub Actions run.

### Studio runtime

The release image runs TanStack Start on Node at port 8080 and a single private
Python engine at `127.0.0.1:8081`. The supervisor forwards termination and stops
the container if either process exits. The HTTP smoke check verifies SSR pages,
assets, API/docs, MCP and origin protection through the public Node entry point.
The persistent `/data` volume and release version checks remain unchanged.
