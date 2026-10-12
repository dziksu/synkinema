import { readFileSync } from "node:fs";
import { assertReleaseMetadata } from "./release-pr.mjs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
assertReleaseMetadata(process.cwd(), version);
console.log(`Release metadata v${version} is consistent.`);
