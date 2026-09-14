import { execFileSync } from "node:child_process";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import config from "../../.releaserc.json" with { type: "json" };

// Local analysis only. No semantic-release engine, tokens, fetches, tags or pushes.
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let tag;
try {
  tag = git("describe", "--tags", "--match", "v[0-9]*", "--abbrev=0");
} catch {
  /* first release */
}
const raw = git(
  "log",
  ...(tag ? [`${tag}..HEAD`] : ["HEAD"]),
  "--format=%H%x00%B%x00",
);
const fields = raw.split("\0");
const commits = [];
for (let i = 0; i + 1 < fields.length; i += 2)
  commits.push({ hash: fields[i].trim(), message: fields[i + 1].trim() });
const type = await analyzeCommits(config.plugins[0][1], {
  cwd: process.cwd(),
  env: process.env,
  commits,
  logger: { log() {} },
});
console.log(
  JSON.stringify(
    {
      baseline: tag ?? "No release tag",
      analyzed_commits: commits.length,
      release_type: type,
      first_release: !tag && type ? "1.0.0" : null,
      uncommitted_changes_included: false,
      publishes: false,
    },
    null,
    2,
  ),
);
