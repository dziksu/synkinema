import { generateApi } from "swagger-typescript-api";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const studio = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(studio, "../..");
const check = process.argv.includes("--check");
const checkedIn = resolve(studio, "src/api/generated");
const output = check
  ? mkdtempSync(resolve(tmpdir(), "synkinema-api-check-"))
  : checkedIn;
const python =
  process.env.SYNKINEMA_PYTHON ||
  (existsSync(resolve(root, ".venv/bin/python"))
    ? resolve(root, ".venv/bin/python")
    : "python3");
try {
  execFileSync(python, [resolve(root, "scripts/export_openapi.py"), output], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync(
    python,
    [resolve(root, "scripts/export_edit_cases.py"), output],
    { cwd: root, stdio: "inherit" },
  );
  await generateApi({
    input: resolve(output, "openapi.json"),
    output,
    fileName: "client.ts",
    name: "client.ts",
    httpClientType: "fetch",
    unwrapResponseData: true,
    enumStyle: "union",
    sortTypes: true,
    sortRoutes: true,
  });
  const files = [
    "client.ts",
    "openapi.json",
    "defaults.json",
    "edit-cases.json",
  ];
  const formatRoot = mkdtempSync(resolve(tmpdir(), "synkinema-api-format-"));
  try {
    const config = JSON.parse(
      readFileSync(resolve(root, "biome.json"), "utf8"),
    );
    delete config.files;
    config.vcs = { enabled: false };
    writeFileSync(resolve(formatRoot, "biome.json"), JSON.stringify(config));
    execFileSync(
      resolve(studio, "node_modules/.bin/biome"),
      [
        "format",
        "--write",
        "--config-path",
        formatRoot,
        ...files.map((f) => resolve(output, f)),
      ],
      { cwd: studio, stdio: "inherit", timeout: 30000 },
    );
  } finally {
    rmSync(formatRoot, { recursive: true, force: true });
  }
  if (check)
    for (const file of files) {
      if (
        !existsSync(resolve(checkedIn, file)) ||
        readFileSync(resolve(output, file), "utf8") !==
          readFileSync(resolve(checkedIn, file), "utf8")
      ) {
        throw new Error(
          `Generated API drift: ${file}. Run npm run api:generate in apps/studio.`,
        );
      }
    }
} finally {
  if (check) rmSync(output, { recursive: true, force: true });
}
