import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isStableVersion } from "./rules.mjs";

const changelogPreamble = `# Changelog

All notable changes to this project are documented in this file.

Release notes are generated from Conventional Commits by semantic-release and
committed in a reviewed release pull request.`;

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, json(value));
}

function updatePackage(path, version) {
  const value = readJson(path);
  if (typeof value.version !== "string")
    throw new Error(`Expected a package version in ${path}.`);
  value.version = version;
  writeJson(path, value);
}

function updateLockfile(path, version) {
  const value = readJson(path);
  if (
    typeof value.version !== "string" ||
    typeof value.packages?.[""]?.version !== "string"
  ) {
    throw new Error(`Expected a root package version in ${path}.`);
  }
  value.version = version;
  value.packages[""].version = version;
  writeJson(path, value);
}

function updatePythonVersion(path, version) {
  const original = readFileSync(path, "utf8");
  const value = original.replace(
    /^__version__ = "[^"\n]+"$/m,
    `__version__ = "${version}"`,
  );
  if (value === original)
    throw new Error(`Expected one Python version in ${path}.`);
  writeFileSync(path, value);
}

function updateDockerDefaults(path, version) {
  const original = readFileSync(path, "utf8");
  const value = original.replace(
    /^ARG APP_VERSION=[^\n]+$/gm,
    `ARG APP_VERSION=${version}`,
  );
  if ((value.match(/^ARG APP_VERSION=/gm) ?? []).length !== 2)
    throw new Error(`Expected two Docker version defaults in ${path}.`);
  writeFileSync(path, value);
}

function versionHeading(version) {
  return new RegExp(
    `^## (?:\\[)?${version.replaceAll(".", "\\.")}(?:\\])?`,
    "m",
  );
}

export function updateChangelog(existing, version, notes) {
  if (!isStableVersion(version))
    throw new Error("A stable semantic version is required.");
  const releaseNotes = notes.trim();
  if (!versionHeading(version).test(releaseNotes))
    throw new Error(
      "Release notes must begin with the planned version heading.",
    );
  if (versionHeading(version).test(existing)) return existing;
  const firstRelease = existing.search(/^## /m);
  const history =
    firstRelease === -1 ? "" : existing.slice(firstRelease).trim();
  return `${changelogPreamble}\n\n${releaseNotes}${history ? `\n\n${history}` : ""}\n`;
}

export function writeReleasePullRequest({ cwd, version, notes }) {
  if (!isStableVersion(version))
    throw new Error("A stable semantic version is required.");
  const at = (...parts) => join(cwd, ...parts);
  updatePackage(at("package.json"), version);
  updateLockfile(at("package-lock.json"), version);
  updatePackage(at("apps/studio/package.json"), version);
  updateLockfile(at("apps/studio/package-lock.json"), version);
  updatePythonVersion(at("apps/server/synkinema/__init__.py"), version);
  updateDockerDefaults(at("Dockerfile"), version);
  writeFileSync(
    at("CHANGELOG.md"),
    updateChangelog(readFileSync(at("CHANGELOG.md"), "utf8"), version, notes),
  );
}

export function assertReleaseMetadata(cwd, version) {
  if (!isStableVersion(version))
    throw new Error("A stable semantic version is required.");
  const at = (...parts) => join(cwd, ...parts);
  const packagePaths = ["package.json", "apps/studio/package.json"];
  const lockPaths = ["package-lock.json", "apps/studio/package-lock.json"];
  for (const path of packagePaths) {
    if (readJson(at(path)).version !== version)
      throw new Error(`Release version does not match ${path}.`);
  }
  for (const path of lockPaths) {
    const value = readJson(at(path));
    if (value.version !== version || value.packages?.[""]?.version !== version)
      throw new Error(`Release version does not match ${path}.`);
  }
  if (
    !readFileSync(at("apps/server/synkinema/__init__.py"), "utf8").includes(
      `__version__ = "${version}"`,
    )
  ) {
    throw new Error("Release version does not match the Python application.");
  }
  if (
    (
      readFileSync(at("Dockerfile"), "utf8").match(
        new RegExp(`^ARG APP_VERSION=${version.replaceAll(".", "\\.")}$`, "gm"),
      ) ?? []
    ).length !== 2
  ) {
    throw new Error("Release version does not match the Docker defaults.");
  }
  if (!versionHeading(version).test(readFileSync(at("CHANGELOG.md"), "utf8")))
    throw new Error("Release version is missing from CHANGELOG.md.");
  if (
    readJson(at("apps/studio/src/api/generated/openapi.json")).info?.version !==
    version
  )
    throw new Error(
      "Release version does not match the generated OpenAPI schema.",
    );
  if (
    !readFileSync(
      at("apps/studio/src/api/generated/client.ts"),
      "utf8",
    ).includes(`@version ${version}`)
  ) {
    throw new Error("Release version does not match the generated API client.");
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const planPath = process.env.SYNKINEMA_RELEASE_PLAN;
  if (!planPath)
    throw new Error(
      "SYNKINEMA_RELEASE_PLAN must name the semantic-release plan JSON.",
    );
  const plan = readJson(planPath);
  writeReleasePullRequest({ cwd: process.cwd(), ...plan });
}
