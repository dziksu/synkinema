import assert from "node:assert/strict";
import { test } from "node:test";
import { titleForEvent } from "./pr-title.mjs";

const environment = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REPOSITORY: "dziksu/synkinema",
  GITHUB_TOKEN: "test-token",
  GITHUB_SHA: "a".repeat(40),
};

test("release title dispatch reads the PR tied to the checked commit", async () => {
  const title = await titleForEvent(
    { inputs: { pull_request_number: "42" } },
    environment,
    async (url, options) => {
      assert.equal(
        url,
        "https://api.github.com/repos/dziksu/synkinema/pulls/42",
      );
      assert.equal(options.headers.Authorization, "Bearer test-token");
      return {
        ok: true,
        json: async () => ({
          state: "open",
          title: "chore(release): v1.6.2",
          base: { ref: "main" },
          head: {
            ref: "chore/release",
            sha: environment.GITHUB_SHA,
            repo: { full_name: environment.GITHUB_REPOSITORY },
          },
        }),
      };
    },
  );
  assert.equal(title, "chore(release): v1.6.2");
});

test("release title dispatch rejects a PR for another commit", async () => {
  await assert.rejects(
    titleForEvent(
      { inputs: { pull_request_number: "42" } },
      environment,
      async () => ({
        ok: true,
        json: async () => ({
          state: "open",
          title: "chore(release): v1.6.2",
          base: { ref: "main" },
          head: {
            ref: "chore/release",
            sha: "b".repeat(40),
            repo: { full_name: environment.GITHUB_REPOSITORY },
          },
        }),
      }),
    ),
    /does not match this workflow run/,
  );
});
