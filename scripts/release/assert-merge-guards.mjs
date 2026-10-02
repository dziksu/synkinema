import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const requiredChecks = [
  "Verify code and API contract",
  "Studio tests and build",
  "Container (linux/amd64)",
  "Container (linux/arm64)",
  "Conventional PR title",
];

export function assertReleaseMergeGuards(rules) {
  const pullRequestRules = rules.filter((rule) => rule.type === "pull_request");
  if (pullRequestRules.length === 0) {
    throw new Error("The active main ruleset must require pull requests.");
  }
  for (const type of ["non_fast_forward", "deletion"]) {
    if (!rules.some((rule) => rule.type === type)) {
      throw new Error(`The active main ruleset must block ${type}.`);
    }
  }
  const configured = new Set(
    rules
      .filter((rule) => rule.type === "required_status_checks")
      .flatMap((rule) => rule.parameters?.required_status_checks ?? [])
      .map((check) => check.context),
  );
  const missing = requiredChecks.filter((check) => !configured.has(check));
  if (missing.length > 0) {
    throw new Error(
      `The active main ruleset must require all release checks: ${missing.join(", ")}.`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertReleaseMergeGuards(JSON.parse(readFileSync(process.argv[2], "utf8")));
}
