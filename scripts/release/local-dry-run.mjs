// Test helper. Only a local file:// remote and dryRun=true; no publishing plugins.
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { Writable } from "node:stream";
import semanticRelease from "semantic-release";
import config from "../../.releaserc.json" with { type: "json" };

const [work, remote, output] = process.argv.slice(2);
if (!work || !remote || !output)
  throw new Error("Local fixture paths are required.");
const sink = new Writable({
  write(_chunk, _encoding, done) {
    done();
  },
});
const result = await semanticRelease(
  {
    branches: ["main"],
    tagFormat: config.tagFormat,
    repositoryUrl: pathToFileURL(remote).href,
    ci: false,
    dryRun: true,
    plugins: config.plugins
      .slice(0, 2)
      .map(([plugin, options]) => [
        fileURLToPath(import.meta.resolve(plugin)),
        options,
      ]),
  },
  {
    cwd: work,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: "false" },
    stdout: sink,
    stderr: sink,
  },
);
writeFileSync(output, JSON.stringify({ version: result.nextRelease.version }));
