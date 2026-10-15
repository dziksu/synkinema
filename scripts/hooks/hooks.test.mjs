import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertCommitMessage } from "./commit-msg.mjs";
import { assertPushCheckout, commitsToCheck } from "./pre-push.mjs";

const head = "a".repeat(40);
const other = "b".repeat(40);
const zero = "0".repeat(40);
const push = (sha = head) => `refs/heads/main ${sha} refs/heads/main ${zero}\n`;

test("commit hook shares semantic-release subject rules and accepts breaking footers", () => {
  assert.doesNotThrow(() =>
    assertCommitMessage(
      "feat(studio)!: change captions\n\nBREAKING CHANGE: new units",
    ),
  );
  assert.doesNotThrow(() =>
    assertCommitMessage("ci: minimize hosted verification"),
  );
  assert.throws(
    () => assertCommitMessage("update things"),
    /Conventional Commit/,
  );
});

test("pre-push checks branch and tag commits, deduplicates refs and skips deletions", () => {
  assert.deepEqual(commitsToCheck(push() + push()), [head]);
  assert.deepEqual(commitsToCheck(push(zero)), []);
  assert.equal(
    assertPushCheckout(push(zero), () => assert.fail()),
    false,
  );
  const calls = [];
  assert.equal(
    assertPushCheckout(
      `refs/tags/v1.2.3 ${other} refs/tags/v1.2.3 ${zero}`,
      (args) => {
        calls.push(args);
        return args[0] === "status" ? "" : head;
      },
    ),
    true,
  );
  assert.ok(calls.some((args) => args[1] === `${other}^{commit}`));
  assert.throws(() => commitsToCheck("invalid"), /Invalid Git/);
});

test("pre-push rejects a different revision or dirty tracked work instead of checking misleading files", () => {
  assert.throws(
    () =>
      assertPushCheckout(push(other), (args) =>
        args[1] === "HEAD" ? head : other,
      ),
    /Check out the commit/,
  );
  assert.throws(
    () =>
      assertPushCheckout(push(), (args) =>
        args[0] === "status" ? " M file.ts" : head,
      ),
    /Commit or stash/,
  );
});

test("installed Husky rejects an invalid commit and prevents a push after a failed check", () => {
  const cwd = mkdtempSync(join(tmpdir(), "synkinema-hook-test-"));
  const env = {
    ...process.env,
    CI: "false",
    NODE_ENV: "test",
    HUSKY: "1",
    SYNKINEMA_HOOK_SOURCE: fileURLToPath(new URL(".", import.meta.url)),
  };
  const git = (...args) =>
    execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: "pipe" });
  try {
    git("init", "--initial-branch=main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "Hook test");
    mkdirSync(join(cwd, ".husky"));
    for (const hook of ["commit-msg", "pre-push"]) {
      writeFileSync(
        join(cwd, ".husky", hook),
        `node "$SYNKINEMA_HOOK_SOURCE/${hook}.mjs" "$1"\n`,
      );
    }
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("./install.mjs", import.meta.url))],
      { cwd, env },
    );
    assert.equal(git("config", "--get", "core.hooksPath").trim(), ".husky/_");
    writeFileSync(join(cwd, "README.md"), "Hook fixture\n");
    git("add", "README.md");
    const rejected = spawnSync("git", ["commit", "-m", "not conventional"], {
      cwd,
      env,
      encoding: "utf8",
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Conventional Commit/);
    git("commit", "-m", "ci: test local checks");

    const remote = join(cwd, "remote.git");
    git("init", "--bare", "--initial-branch=main", remote);
    mkdirSync(join(cwd, ".test-bin"));
    writeFileSync(join(cwd, ".test-bin/make"), "#!/bin/sh\nexit 1\n", {
      mode: 0o755,
    });
    const pushed = spawnSync("git", ["push", remote, "main"], {
      cwd,
      env: { ...env, PATH: `${join(cwd, ".test-bin")}:${env.PATH}` },
      encoding: "utf8",
    });
    assert.notEqual(pushed.status, 0);
    assert.match(
      pushed.stdout + pushed.stderr,
      /Checking the pushed revision locally/,
    );
    assert.equal(
      git(
        "--git-dir",
        remote,
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads",
      ),
      "",
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("CI, production and explicit opt-out installs work without a Git checkout", () => {
  const cwd = mkdtempSync(join(tmpdir(), "synkinema-hook-install-"));
  try {
    for (const override of [
      { CI: "true" },
      { NODE_ENV: "production" },
      { HUSKY: "0" },
    ]) {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./install.mjs", import.meta.url))],
        {
          cwd,
          env: { ...process.env, ...override },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
