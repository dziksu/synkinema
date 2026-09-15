import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertReleaseMetadata } from "./release-pr.mjs";
import { isCommit, isRepository, isStableVersion } from "./rules.mjs";

export async function prepare(_options, { cwd, env, nextRelease }) {
  const { version, gitHead } = nextRelease;
  const repository = env.GITHUB_REPOSITORY;
  if (
    !isStableVersion(version) ||
    !isCommit(gitHead) ||
    !isRepository(repository)
  ) {
    throw new Error("Invalid release artifact identity.");
  }
  assertReleaseMetadata(cwd, version);
  const image = `ghcr.io/${repository.toLowerCase()}:v${version}`;
  const original = readFileSync(join(cwd, "compose.release.yaml"), "utf8");
  const placeholder = /\$\{SYNKINEMA_IMAGE:-ghcr\.io\/[^}]+\}/g;
  if ([...original.matchAll(placeholder)].length !== 1)
    throw new Error("Expected one Compose image default.");
  const schema = JSON.parse(
    readFileSync(
      join(cwd, "apps/studio/src/api/generated/openapi.json"),
      "utf8",
    ),
  );
  schema.info.version = version;
  const out = join(cwd, ".release");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "compose.release.yaml"),
    original.replace(placeholder, `\${SYNKINEMA_IMAGE:-${image}}`),
  );
  writeFileSync(
    join(out, "openapi.json"),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
  writeFileSync(
    join(out, "release.json"),
    `${JSON.stringify({ version, commit: gitHead, image, source: `https://github.com/${repository}/tree/${gitHead}` }, null, 2)}\n`,
  );
}
