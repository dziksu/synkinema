import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync, execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import config from "../../.releaserc.json" with { type: "json" };
import { prepare } from "./prepare.mjs";
import {
  assertReleaseMetadata,
  writeReleasePullRequest,
} from "./release-pr.mjs";
import {
  assertReleaseEnvironment,
  imageTags,
  isConventionalTitle,
  isStableVersion,
  versionFromTags,
} from "./rules.mjs";

const logger = { log() {} };

function writeReleaseMetadataFixture(cwd, version) {
  const packageValue = { name: "synkinema", version };
  const lockValue = { version, packages: { "": { version } } };
  const writeJson = (path, value) =>
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  mkdirSync(join(cwd, "apps/studio/src/api/generated"), { recursive: true });
  mkdirSync(join(cwd, "apps/server/synkinema"), { recursive: true });
  writeJson(join(cwd, "package.json"), packageValue);
  writeJson(join(cwd, "package-lock.json"), lockValue);
  writeJson(join(cwd, "apps/studio/package.json"), packageValue);
  writeJson(join(cwd, "apps/studio/package-lock.json"), lockValue);
  writeFileSync(
    join(cwd, "apps/server/synkinema/__init__.py"),
    `__version__ = "${version}"\n`,
  );
  writeFileSync(
    join(cwd, "Dockerfile"),
    `ARG APP_VERSION=${version}\nFROM node\nARG APP_VERSION=${version}\n`,
  );
  writeFileSync(join(cwd, "CHANGELOG.md"), `# Changelog\n\n## ${version}\n`);
  writeJson(join(cwd, "apps/studio/src/api/generated/openapi.json"), {
    info: { version },
    paths: {},
  });
  writeFileSync(
    join(cwd, "apps/studio/src/api/generated/client.ts"),
    `/** @version ${version} */\n`,
  );
}

test("release assets pin the chosen version without changing source files", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "synkinema-release-assets-"));
  const original =
    "services:\n  synkinema:\n    image: ${SYNKINEMA_IMAGE:-ghcr.io/dziksu/synkinema:latest}\n";
  try {
    writeFileSync(join(cwd, "compose.release.yaml"), original);
    writeReleaseMetadataFixture(cwd, "1.2.3");
    const schemaPath = join(cwd, "apps/studio/src/api/generated/openapi.json");
    const context = {
      cwd,
      env: { GITHUB_REPOSITORY: "Owner/Studio" },
      nextRelease: { version: "1.2.3", gitHead: "b".repeat(40) },
    };
    await prepare({}, context);
    assert.match(
      readFileSync(join(cwd, ".release/compose.release.yaml"), "utf8"),
      /ghcr.io\/owner\/studio:v1.2.3/,
    );
    assert.equal(
      JSON.parse(readFileSync(join(cwd, ".release/openapi.json"), "utf8")).info
        .version,
      "1.2.3",
    );
    assert.equal(
      JSON.parse(readFileSync(join(cwd, ".release/release.json"), "utf8"))
        .commit,
      "b".repeat(40),
    );
    assert.equal(
      readFileSync(join(cwd, "compose.release.yaml"), "utf8"),
      original,
    );
    assert.equal(
      JSON.parse(readFileSync(schemaPath, "utf8")).info.version,
      "1.2.3",
    );
    await assert.rejects(
      prepare(
        {},
        {
          ...context,
          nextRelease: { ...context.nextRelease, version: "1.2.3\n" },
        },
      ),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("release PR metadata updates every source version and requires regenerated API output", () => {
  const cwd = mkdtempSync(join(tmpdir(), "synkinema-release-pr-"));
  try {
    writeReleaseMetadataFixture(cwd, "1.0.1");
    writeReleasePullRequest({
      cwd,
      version: "1.1.0",
      notes:
        "## [1.1.0](https://example.invalid/compare) (2026-09-15)\n\n### Features\n\n* add release PRs",
    });
    assert.equal(
      JSON.parse(readFileSync(join(cwd, "package.json"))).version,
      "1.1.0",
    );
    assert.equal(
      JSON.parse(readFileSync(join(cwd, "apps/studio/package-lock.json")))
        .packages[""].version,
      "1.1.0",
    );
    assert.match(
      readFileSync(join(cwd, "CHANGELOG.md"), "utf8"),
      /^## \[1\.1\.0\]/m,
    );
    assert.throws(
      () => assertReleaseMetadata(cwd, "1.1.0"),
      /generated OpenAPI/,
    );
    writeReleaseMetadataFixture(cwd, "1.1.0");
    assert.doesNotThrow(() => assertReleaseMetadata(cwd, "1.1.0"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
for (const [message, expected] of [
  ["fix: repair export", "patch"],
  ["feat: add captions", "minor"],
  ["perf: bound decoders", "patch"],
  ["feat!: change timeline units", "major"],
  ["docs!: remove legacy API", "major"],
  ["fix: schema\n\nBREAKING CHANGE: remove old clip field", "major"],
  ["build(deps): update FFmpeg", "patch"],
  ["build(deps-dev): update Biome", null],
  ["docs: improve setup", null],
  ["ci: update workflow", null],
  ["chore: housekeeping", null],
])
  test(`version selection: ${message.split("\n")[0]}`, async () => {
    assert.equal(
      await analyzeCommits(config.plugins[0][1], {
        cwd: process.cwd(),
        env: process.env,
        logger,
        commits: [{ hash: "a".repeat(40), message }],
      }),
      expected,
    );
  });

test("notes generator is compatible with the pinned preset and includes dependencies", async () => {
  const notes = await generateNotes(config.plugins[1][1], {
    cwd: process.cwd(),
    env: process.env,
    logger,
    options: { repositoryUrl: "https://github.com/dziksu/synkinema.git" },
    branch: { name: "main" },
    lastRelease: { gitTag: "v1.0.0" },
    nextRelease: { gitTag: "v1.0.1", version: "1.0.1" },
    commits: [{ hash: "b".repeat(40), message: "build(deps): update FFmpeg" }],
  });
  assert.match(notes, /Build and Dependencies/);
  assert.match(notes, /update FFmpeg/);
});

test("only one stable tag on the same commit can resume publication", () => {
  assert.equal(versionFromTags("v1.2.3\nother"), "1.2.3");
  assert.equal(versionFromTags("v1.2.3-beta.1"), "");
  assert.throws(() => versionFromTags("v1.2.3\nv1.2.4"));
  for (const v of [
    "01.2.3",
    "1.2.3\n",
    "1.2.3\r",
    "1.2.3\nversion=bad",
    "v1.2.3",
    "1.2",
    "1.2.3-rc.1",
  ])
    assert.equal(isStableVersion(v), false);
});

test("retrying an older release does not roll back latest or a minor tag", () => {
  const sha = "a".repeat(40);
  assert.deepEqual(imageTags("Owner/Studio", "1.2.3", sha, false), [
    "ghcr.io/owner/studio:v1.2.3",
    `ghcr.io/owner/studio:sha-${sha}`,
  ]);
  assert.equal(
    imageTags("Owner/Studio", "1.2.3", sha, true).at(-1),
    "ghcr.io/owner/studio:latest",
  );
  assert.throws(() => imageTags("bad\nrepo", "1.2.3", sha, true));
});

test("release guard rejects local shells, PRs, forks and unverified checkouts", () => {
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_OUTPUT: "/tmp/output",
    GITHUB_TOKEN: "test",
  };
  const event = { repository: { fork: false, full_name: "owner/repo" } };
  assert.doesNotThrow(() => assertReleaseEnvironment(env, event));
  for (const change of [
    { GITHUB_ACTIONS: "false" },
    { GITHUB_REF: "refs/pull/1/merge" },
    { GITHUB_EVENT_NAME: "pull_request_target" },
    { GITHUB_SHA: "abc" },
    { GITHUB_TOKEN: "" },
  ]) {
    assert.throws(() => assertReleaseEnvironment({ ...env, ...change }, event));
  }
  assert.throws(() =>
    assertReleaseEnvironment(env, {
      repository: { ...event.repository, fork: true },
    }),
  );
  const result = spawnSync(process.execPath, ["scripts/release/publish.mjs"], {
    env: { ...process.env, GITHUB_ACTIONS: "false", GITHUB_EVENT_PATH: "" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Releases must run in GitHub Actions/);
});

test("PR titles are parsed as plain data", () => {
  assert.equal(isConventionalTitle("feat(studio): improve captions"), true);
  assert.equal(
    isConventionalTitle("build(deps)!: remove unsupported runtime"),
    true,
  );
  assert.equal(isConventionalTitle("improve captions"), false);
  assert.equal(isConventionalTitle("fix: captions\nfeat: injected"), false);
});

test("first push selects 1.0.0 in an isolated local repository without creating a tag", async () => {
  const directory = mkdtempSync(join(tmpdir(), "synkinema-release-test-"));
  const work = join(directory, "work");
  const remote = join(directory, "remote.git");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init", "--bare", "--initial-branch=main", remote);
    git("clone", remote, work);
    git("-C", work, "config", "user.email", "test@example.invalid");
    git("-C", work, "config", "user.name", "Release test");
    writeFileSync(join(work, "README.md"), "Local release fixture\n");
    git("-C", work, "add", "README.md");
    git("-C", work, "commit", "-m", "feat: initial editor");
    git("-C", work, "push", "origin", "main");
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, CI: "false" };
    const output = join(directory, "result.json");
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("./local-dry-run.mjs", import.meta.url)),
        work,
        remote,
        output,
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    assert.equal(JSON.parse(readFileSync(output, "utf8")).version, "1.0.0");
    assert.equal(git("--git-dir", remote, "tag", "--list"), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
