# Local checks, minimal CI and releases

The implementation follows the useful parts of
[StructSmith at b330b4a](https://github.com/dziksu/StructSmith/tree/b330b4a24faf45f1c9b0e15914a1fcc45d5ee555):
Conventional Commits, verification before release, a reusable GHCR workflow,
versioned multi-architecture images, retry handling and community documentation.
It is adapted to Python/React/npm, not Bun.

Routine verification runs locally through Husky. `npm ci` in the repository root
installs the hooks: `pre-commit` checks formatting/lint, `commit-msg` validates
Conventional Commits, and `pre-push` runs the complete `make check` gate. The push
hook requires a clean tracked checkout of the pushed commit so it does not verify
uncommitted files instead. Deleting refs needs no build; pushing another revision
requires checking it out first. These hooks never publish, install dependencies or
change source files. Install the documented Python/Studio dependencies first.
If dependencies were installed with `--ignore-scripts`, run `npm run prepare` once.
CI/production installs skip hook setup. `HUSKY=0` is an explicit local escape hatch;
checks are still mandatory before release, and contributors should include local
verification results in their PRs. Browser-created and Dependabot PRs need a local
checkout and `make check` before manual merge because they do not run local hooks.

GitHub runs one small Conventional PR title job for ordinary PRs. The CI workflow
reports skipped release gates so required status checks do not remain pending.
A push to `main` first performs read-only semantic-release planning. With no release
or exact tagged retry, it stops there. A planned version opens/updates the
release-metadata PR without building containers or launchers. That PR receives
only a small metadata check and the title check. Once merged, the exact `main`
checkout must pass `make check` and both native Linux container smoke tests before
semantic-release creates the tag and GitHub Release. Launcher builds run once,
only during publication after the image succeeds. CodeQL is available by manual
workflow dispatch; it has no PR, push or scheduled trigger.

Synkinema uses only the built-in `GITHUB_TOKEN`. The release PR contains the
canonical generated `CHANGELOG.md`, matching package/application versions and
regenerated API metadata. With the repository rules below, the bot queues an
automatic squash merge after dispatching the two lightweight required checks.
Without auto-merge, a maintainer merges that PR manually; publication still waits
for the complete release verification gate.

## First push preparation

No remote is needed for local checks. No push or external publication is performed
by `make check` or `npm run release:check`.

`make dependency-check` checks shared Python pins before the rest of `make check`
and CI verification. Update shared packages in `requirements.txt` and
`requirements-local.txt` together. Keep `huggingface-hub` below version 2 while
the pinned `tokenizers` release requires it; migrate the speech dependencies together.
The launcher resolves `pydantic-core` from Pydantic's exact dependency metadata;
do not add an independent core pin that can conflict with the selected Pydantic.

1. Run `npm ci` to install root tooling and Husky, install Studio/Python
   dependencies as in the README, then run `make check`. Workflow validation
   is included and caches the checksum-verified actionlint archive locally.
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
5. Add the remote and push only when ready. A releasable push to `main` opens a
   release PR. Once the metadata
   and title checks pass, automatic merge starts full release verification, then
   publishes the version. With no previous stable tag, semantic-release selects
   **1.0.0**.
6. After the first GHCR publication, check the package's visibility. New packages
   can default to private; make it public in GitHub Packages if anonymous pulls
   are intended. Public examples work only after this setting and publication.

Repository settings cannot be applied by files in this checkout. Before enabling
automatic release merging, create an **active branch ruleset** for `main` that
requires pull requests and successful checks, blocks force pushes and deletion,
and has no bypass. Enable **Allow auto-merge**, allow squash merging, set the
squash commit subject to the PR title, and disable merge commits and rebase
merging. The generated `chore/release` title should be retained for traceability.
The ruleset must require the two checks below; the workflow verifies those active
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
**Release metadata** and **Conventional PR title**. When migrating from the old
CI, remove required **Verify code and API contract**, **Studio tests and build**,
**Container (linux/amd64)** and **Container (linux/arm64)** checks from repository
settings; they now run only for publication and cannot be PR requirements. Ordinary
PRs report the metadata check as skipped, which
[GitHub treats as successful](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging). Do not
use path filters on this workflow: they can leave required checks pending. Ruleset
changes are a separate repository administration step; checkout files cannot apply
them. CodeQL runs only when manually dispatched for public repositories; private
repositories need GitHub Code Security and the `ENABLE_CODEQL=true` repository
variable.
Enable private vulnerability reporting in Settings → Security for the advisory
link in `SECURITY.md`. Dependabot uses the checked-in configuration automatically.
Routine Dependabot updates run on Mondays at 09:00 Europe/Warsaw and combine
minor/patch updates into one PR per area: release tooling, Studio, Python,
containers and GitHub Actions. npm/Python major migrations stay separate, subject
to the existing migration ignores. Version PR limits are two per npm/Python entry
and one per Docker/Actions entry. Security updates have their own groups and do
not wait for the weekly version-update schedule or consume those version limits.

## Pipeline

| Stage | Behavior |
|---|---|
| Local Husky | Formatting/lint before commit; Conventional Commit subject validation; complete `make check` before push |
| PR title | Tiny remote check of the title used for squash-merge versioning, read as plain event data |
| Release plan | First job on main; computes the version or resumes an exact tag on this commit; non-releasing pushes stop here |
| Release PR | Updates canonical changelog, manifests/lockfiles, Python/Docker versions and generated API contract; dispatches metadata/title checks |
| Release metadata | Dependency-free Node check on `chore/release`; verifies source versions, changelog and generated API version identity |
| Release verification | One job running `make check`, including API drift, Python/FFmpeg tests, Studio tests, typecheck/build and release/hook/workflow regressions; only after version metadata is ready on main |
| Containers | Both native Linux architectures smoke-test the selected version/commit after code verification; render, MCP, HTTP/UI and compiled host-helper checks must pass before tagging |
| Semantic release | Creates `vX.Y.Z` and the GitHub release only after code/API and both container smoke gates pass |
| Publish image | Verifies exact tag/commit identity, reuses native smoke-build caches and publishes both architectures with SBOM/provenance |
| Local launcher | Builds four macOS/Linux arm64/x64 artifacts once after image publication, checks their identity and publishes matching installer/checksums |
| CodeQL | Optional manual audit; no automatic PR, push or weekly jobs |

PRs never receive publishing credentials. Main runs are serialized and not
cancelled halfway through publication.
The release workflow is invoked through `workflow_call` because tags created with
`GITHUB_TOKEN` do not trigger a second workflow. All third-party actions are pinned
to full commit SHAs; Dependabot maintains them. Native image caches are best effort
and include intermediate layers for reuse by the final publication of the same
commit/version.
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
before upload. After the image push and again before installer upload, an
anonymous GHCR token/manifest check verifies the exact version is publicly
readable and contains Linux amd64/arm64 images. Authenticated publication alone
does not prove users can download a package. If this check fails, make the package
public in GitHub Packages and rerun the failed workflow for the same tag/commit;
the workflow does not change package visibility or fall back to a different image.
Launcher assets publish only after the matching image succeeds;
an older release retry uploads to its own tag without changing `latest`. Planning
recognizes an existing stable tag on the exact checkout, so rerunning after tag
creation still enables all gates;
a later housekeeping commit cannot accidentally resume an unrelated version.
`make check` includes installer/gateway regression tests; the release container smoke
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
response all use the selected version. Release smoke builds use the selected
release version so publication can reuse their cached layers. Local version-stamping
regression tests cover overrides. Source API drift checks run before image-only
stamping.

The build records OCI source/version/revision labels, SBOM and provenance. The
publication job summary includes the pushed manifest digest. Use a digest to pin
an exact artifact; a rebuilt version tag can have a different digest if its base
image or OS package repository changed. Node/Python application dependencies use
lockfiles; base-image and OS security updates are intentional rebuild inputs.

## Recovery

- **Verification/build failure:** fix it and push the change. A release PR may
  already be merged, but no tag or image publishes until code/API and both container
  smoke tests pass on the exact main checkout. A later push replans the pending
  release and updates metadata if needed.
- **Release PR cannot be created or updated:** enable GitHub Actions permission to
  create pull requests and confirm the workflow token scopes in repository or
  organization settings. The workflow never falls back to committing on `main`.
- **Release PR remains open:** check the two required statuses, the active `main`
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
