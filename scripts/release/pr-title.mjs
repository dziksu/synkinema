import { readFileSync } from "node:fs";
import { isConventionalTitle } from "./rules.mjs";
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
if (!isConventionalTitle(event.pull_request?.title ?? "")) {
  throw new Error(
    "Use a Conventional Commit PR title, e.g. feat(studio): add caption styles. Squash merges use this title for release versioning.",
  );
}
console.log("Conventional PR title verified.");
