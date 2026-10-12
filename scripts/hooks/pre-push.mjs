import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function commitsToCheck(input) {
  const commits = [];
  for (const line of input.trim().split("\n").filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    if (
      fields.length !== 4 ||
      !/^[a-f0-9]{40}$/.test(fields[1]) ||
      !/^[a-f0-9]{40}$/.test(fields[3])
    ) {
      throw new Error("Invalid Git pre-push input.");
    }
    if (fields[1] !== "0".repeat(40)) commits.push(fields[1]);
  }
  return [...new Set(commits)];
}

export function assertPushCheckout(input, git) {
  const commits = commitsToCheck(input);
  if (commits.length === 0) return false; // Deleting remote refs needs no build.

  const head = git(["rev-parse", "HEAD"]);
  for (const commit of commits) {
    // Peel annotated tags so the gate also checks the commit behind a pushed tag.
    if (git(["rev-parse", `${commit}^{commit}`]) !== head) {
      throw new Error(
        "Check out the commit you are pushing and push one checked revision at a time.",
      );
    }
  }
  if (git(["status", "--porcelain", "--untracked-files=no"])) {
    throw new Error(
      "Commit or stash tracked changes before pushing: checks must verify the pushed revision.",
    );
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  if (assertPushCheckout(readFileSync(0, "utf8"), git)) {
    console.log(
      "Checking the pushed revision locally before GitHub release planning…",
    );
    const result = spawnSync("make", ["check"], { stdio: "inherit" });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
}
