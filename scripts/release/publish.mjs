import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import {
  assertReleaseEnvironment,
  isStableVersion,
  versionFromTags,
} from "./rules.mjs";

// Validate before importing semantic-release: local invocations never contact a remote.
const env = process.env;
const event = env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
  : {};
assertReleaseEnvironment(env, event);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("rev-parse", "HEAD") !== env.GITHUB_SHA)
  throw new Error("Checkout differs from the tested commit.");

const { default: semanticRelease } = await import("semantic-release");
const result = await semanticRelease({
  repositoryUrl: `https://github.com/${env.GITHUB_REPOSITORY}.git`,
});
// A retry after a failed container publication reuses only a tag on this exact commit.
const version = result
  ? result.nextRelease.version
  : versionFromTags(git("tag", "--points-at", "HEAD", "--list", "v*"));
if (version) {
  if (!isStableVersion(version)) throw new Error("Invalid release version.");
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/releases/tags/v${version}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok)
    throw new Error(
      `Release tag exists but its GitHub release could not be verified (${response.status}). See docs/RELEASING.md for recovery.`,
    );
  const release = await response.json();
  if (release.draft || release.prerelease)
    throw new Error("Refusing to publish a draft or prerelease as stable.");
}
appendFileSync(env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(
  version
    ? `Release v${version} is ready for container publication.`
    : "No releasable changes.",
);
