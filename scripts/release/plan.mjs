import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import config from "../../.releaserc.json" with { type: "json" };
import { assertReleaseEnvironment } from "./rules.mjs";

const logger = { log() {} };

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function versionFromTag(tag) {
  const [prefix, suffix] = config.tagFormat.split("${version}");
  if (!tag.startsWith(prefix) || !tag.endsWith(suffix)) return null;
  const version = tag.slice(
    prefix.length,
    tag.length - suffix.length || undefined,
  );
  return semver.valid(version) === version && !semver.prerelease(version)
    ? version
    : null;
}

function getLastRelease(cwd) {
  const tags = git(cwd, ["tag", "--merged", "HEAD"])
    .split("\n")
    .filter(Boolean)
    .map((gitTag) => ({ gitTag, version: versionFromTag(gitTag) }))
    .filter(({ version }) => version)
    .sort((a, b) => semver.rcompare(a.version, b.version));
  const release = tags[0];
  return release
    ? { ...release, gitHead: git(cwd, ["rev-list", "-1", release.gitTag]) }
    : {};
}

function getCommits(cwd, from) {
  const fields = git(cwd, [
    "log",
    ...(from ? [`${from}..HEAD`] : ["HEAD"]),
    "--format=%H%x00%B%x00",
  ]).split("\0");
  const commits = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const hash = fields[index].trim();
    if (hash) commits.push({ hash, message: fields[index + 1].trim() });
  }
  return commits;
}

export async function planRelease({ cwd, repositoryUrl, env }) {
  const lastRelease = getLastRelease(cwd);
  const commits = getCommits(cwd, lastRelease.gitHead);
  const type = await analyzeCommits(config.plugins[0][1], {
    cwd,
    env,
    commits,
    logger,
  });
  if (!type) return null;

  const version = lastRelease.version
    ? semver.inc(lastRelease.version, type)
    : "1.0.0";
  const nextRelease = {
    type,
    version,
    gitHead: git(cwd, ["rev-parse", "HEAD"]),
    gitTag: config.tagFormat.replace("${version}", version),
  };
  const notes = await generateNotes(config.plugins[1][1], {
    cwd,
    env,
    logger,
    options: { repositoryUrl },
    lastRelease,
    nextRelease,
    commits,
  });
  return { version, notes };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const env = process.env;
  const event = env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
    : {};
  assertReleaseEnvironment(env, event);
  const repositoryUrl = `https://github.com/${env.GITHUB_REPOSITORY}.git`;
  const plan = await planRelease({ cwd: process.cwd(), repositoryUrl, env });
  if (!plan) {
    writeFileSync(env.GITHUB_OUTPUT, "version=\n");
  } else {
    const out = join(process.cwd(), ".release");
    mkdirSync(out, { recursive: true });
    const path = join(out, "release-plan.json");
    writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
    writeFileSync(env.GITHUB_OUTPUT, `version=${plan.version}\nplan=${path}\n`);
  }
}
