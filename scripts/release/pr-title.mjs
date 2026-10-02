import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isConventionalTitle } from "./rules.mjs";

export async function titleForEvent(event, environment, request = fetch) {
  if (event.pull_request) return event.pull_request.title;

  if (environment.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    throw new Error("A pull request event is required.");
  }
  const number = event.inputs?.pull_request_number;
  const repository = environment.GITHUB_REPOSITORY;
  const token = environment.GITHUB_TOKEN;
  const sha = environment.GITHUB_SHA;
  if (!/^\d+$/.test(number ?? "") || !repository || !token || !sha) {
    throw new Error(
      "A release PR number, repository, token and SHA are required.",
    );
  }

  const response = await request(
    `${environment.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repository}/pulls/${number}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Cannot read release pull request (HTTP ${response.status}).`,
    );
  }
  const pullRequest = await response.json();
  if (
    pullRequest.state !== "open" ||
    pullRequest.base?.ref !== "main" ||
    pullRequest.head?.ref !== "chore/release" ||
    pullRequest.head?.repo?.full_name !== repository ||
    pullRequest.head?.sha !== sha
  ) {
    throw new Error(
      "The release pull request does not match this workflow run.",
    );
  }
  return pullRequest.title;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const title = await titleForEvent(event, process.env);
  if (!isConventionalTitle(title ?? "")) {
    throw new Error(
      "Use a Conventional Commit PR title, e.g. feat(studio): add caption styles. Squash merges use this title for release versioning.",
    );
  }
  console.log("Conventional PR title verified.");
}
