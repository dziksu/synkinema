import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isConventionalTitle } from "../release/rules.mjs";

export function assertCommitMessage(message) {
  const subject = message.split(/\r?\n/, 1)[0];
  if (!isConventionalTitle(subject)) {
    throw new Error(
      "Use a Conventional Commit subject, e.g. feat(studio): add caption styles. " +
        "This subject determines the semantic-release version.",
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertCommitMessage(readFileSync(process.argv[2], "utf8"));
}
