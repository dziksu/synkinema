import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import semanticRelease from "semantic-release";
import config from "../../.releaserc.json" with { type: "json" };
import { assertReleaseEnvironment } from "./rules.mjs";

const sink = new Writable({
  write(_chunk, _encoding, done) {
    done();
  },
});

function analysisPlugins() {
  return config.plugins
    .slice(0, 2)
    .map(([plugin, options]) => [
      fileURLToPath(import.meta.resolve(plugin)),
      options,
    ]);
}

export async function planRelease({ cwd, repositoryUrl, env }) {
  const result = await semanticRelease(
    {
      branches: config.branches,
      tagFormat: config.tagFormat,
      repositoryUrl,
      ci: false,
      dryRun: true,
      plugins: analysisPlugins(),
    },
    { cwd, env, stdout: sink, stderr: sink },
  );
  return result
    ? { version: result.nextRelease.version, notes: result.nextRelease.notes }
    : null;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const env = process.env;
  const event = env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"))
    : {};
  assertReleaseEnvironment(env, event);
  const repositoryUrl = `https://x-access-token:${encodeURIComponent(env.GITHUB_TOKEN)}@github.com/${env.GITHUB_REPOSITORY}.git`;
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
