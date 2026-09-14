// Asset-size/format compilation only: preserve the supplied artwork and alpha.
// Regenerate on macOS with `node apps/studio/scripts/generate-brand-assets.mjs`.
// The committed outputs work on every platform; sips is not a build dependency.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studio = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(studio, "../../assets/branding/logo.png");
const output = resolve(studio, "public/brand");
mkdirSync(output, { recursive: true });
for (const size of [16, 32, 64, 128, 180, 192, 512]) {
  execFileSync(
    "sips",
    [
      "-z",
      String(size),
      String(size),
      source,
      "--out",
      resolve(output, `logo-${size}.png`),
    ],
    { stdio: "ignore" },
  );
}
execFileSync(
  "sips",
  [
    "-s",
    "format",
    "ico",
    resolve(output, "logo-32.png"),
    "--out",
    resolve(studio, "public/favicon.ico"),
  ],
  { stdio: "ignore" },
);
console.log("Generated Synkinema logo, favicon and app icon sizes.");
