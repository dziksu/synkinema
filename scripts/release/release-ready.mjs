import { readFileSync, writeFileSync } from "node:fs";
import { assertReleaseMetadata } from "./release-pr.mjs";

const planPath = process.env.SYNKINEMA_RELEASE_PLAN;
if (!planPath)
  throw new Error(
    "SYNKINEMA_RELEASE_PLAN must name the semantic-release plan JSON.",
  );
if (!process.env.GITHUB_OUTPUT)
  throw new Error(
    "GITHUB_OUTPUT is required to report release metadata readiness.",
  );

const { version } = JSON.parse(readFileSync(planPath, "utf8"));
let ready = true;
try {
  assertReleaseMetadata(process.cwd(), version);
} catch (error) {
  ready = false;
  console.log(`Release metadata is not ready: ${error.message}`);
}
writeFileSync(process.env.GITHUB_OUTPUT, `ready=${ready}\n`, { flag: "a" });
