import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
  imageTags,
  isStableVersion,
  isCommit,
  isRepository,
} from "./rules.mjs";

const {
  RELEASE_VERSION: version,
  RELEASE_SHA: sha,
  GITHUB_REPOSITORY: repository,
  GITHUB_TOKEN: token,
  GITHUB_OUTPUT: output,
} = process.env;
if (
  !isStableVersion(version) ||
  !isCommit(sha) ||
  !isRepository(repository) ||
  !output ||
  !token
)
  throw new Error("Invalid publication inputs.");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (
  git("rev-parse", "HEAD") !== sha ||
  git("rev-parse", `v${version}^{commit}`) !== sha
) {
  throw new Error("Release tag, checkout and tested commit must be identical.");
}
const response = await fetch(
  `https://api.github.com/repos/${repository}/releases/latest`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  },
);
if (!response.ok)
  throw new Error(`Cannot verify latest release (${response.status}).`);
const latest = await response.json();
const tags = imageTags(
  repository,
  version,
  sha,
  latest.tag_name === `v${version}`,
);
appendFileSync(
  output,
  `image=ghcr.io/${repository.toLowerCase()}\ntags<<IMAGE_TAGS\n${tags.join("\n")}\nIMAGE_TAGS\n`,
);
