import assert from "node:assert/strict";
import { test } from "node:test";
import { assertReleaseMergeGuards } from "./assert-merge-guards.mjs";

const checks = ["Release metadata", "Conventional PR title"];

test("release merge guard accepts active rules with every required check", () => {
  assert.doesNotThrow(() =>
    assertReleaseMergeGuards([
      { type: "pull_request" },
      { type: "non_fast_forward" },
      { type: "deletion" },
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: checks.map((context) => ({ context })),
        },
      },
    ]),
  );
});

test("release merge guard rejects missing release metadata verification", () => {
  assert.throws(
    () =>
      assertReleaseMergeGuards([
        { type: "pull_request" },
        { type: "non_fast_forward" },
        { type: "deletion" },
        {
          type: "required_status_checks",
          parameters: {
            required_status_checks: checks
              .filter((context) => context !== "Release metadata")
              .map((context) => ({ context })),
          },
        },
      ]),
    /Release metadata/,
  );
});

test("release merge guard rejects checks without a pull request rule", () => {
  assert.throws(
    () =>
      assertReleaseMergeGuards([
        { type: "non_fast_forward" },
        { type: "deletion" },
        {
          type: "required_status_checks",
          parameters: {
            required_status_checks: checks.map((context) => ({ context })),
          },
        },
      ]),
    /must require pull requests/,
  );
});
