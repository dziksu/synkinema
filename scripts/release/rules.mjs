export const isStableVersion = (value) =>
  typeof value === "string" &&
  value === value.trim() &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);

export const isCommit = (value) =>
  typeof value === "string" &&
  value.length === 40 &&
  /^[a-f0-9]{40}$/.test(value);
export const isRepository = (value) =>
  typeof value === "string" &&
  value === value.trim() &&
  /^[\w.-]+\/[\w.-]+$/.test(value);

export function versionFromTags(tags) {
  const versions = tags
    .split(/\s+/)
    .filter((tag) => tag.startsWith("v"))
    .map((tag) => tag.slice(1))
    .filter(isStableVersion);
  if (versions.length > 1)
    throw new Error("Multiple stable release tags point at HEAD.");
  return versions[0] ?? "";
}

export function assertReleaseEnvironment(env, event) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
    event?.repository?.fork !== false ||
    event.repository.full_name !== env.GITHUB_REPOSITORY
  ) {
    throw new Error(
      "Releases must run in GitHub Actions on main in the original repository after CI succeeds.",
    );
  }
  if (
    !isRepository(env.GITHUB_REPOSITORY) ||
    !isCommit(env.GITHUB_SHA) ||
    !env.GITHUB_OUTPUT ||
    !env.GITHUB_TOKEN
  ) {
    throw new Error(
      "Release identity, commit, output file and GITHUB_TOKEN are required.",
    );
  }
}

export function isConventionalTitle(title) {
  return (
    typeof title === "string" &&
    !/[\r\n]/.test(title) &&
    /^(feat|fix|perf|build|ci|docs|refactor|test|chore|revert|style)(\([a-zA-Z0-9_.\/-]+\))?!?: \S[^\r\n]*$/.test(
      title,
    )
  );
}

export function imageTags(repository, version, sha, isLatest) {
  if (
    !isRepository(repository) ||
    !isStableVersion(version) ||
    !isCommit(sha)
  ) {
    throw new Error("Invalid image identity.");
  }
  const image = `ghcr.io/${repository.toLowerCase()}`;
  const tags = [`${image}:v${version}`, `${image}:sha-${sha}`];
  if (isLatest)
    tags.push(
      `${image}:v${version.split(".").slice(0, 2).join(".")}`,
      `${image}:latest`,
    );
  return tags;
}
