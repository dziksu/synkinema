import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyPublicImage } from "./public-image.mjs";

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const index = {
  manifests: ["amd64", "arm64"].map((architecture) => ({
    platform: { os: "linux", architecture },
  })),
};

test("installer image check uses anonymous credentials and the exact version", async () => {
  const calls = [];
  const image = await verifyPublicImage("Dziksu/Synkinema", "1.7.1", {
    request: async (url, options) => {
      calls.push(url);
      if (calls.length === 1) {
        assert.equal(options.headers, undefined);
        assert.equal(
          new URL(url).searchParams.get("scope"),
          "repository:dziksu/synkinema:pull",
        );
        return response(200, { token: "anonymous-token" });
      }
      assert.equal(url, "https://ghcr.io/v2/dziksu/synkinema/manifests/v1.7.1");
      assert.equal(options.headers.Authorization, "Bearer anonymous-token");
      return response(200, index);
    },
  });
  assert.equal(image, "ghcr.io/dziksu/synkinema:v1.7.1");
  assert.equal(calls.length, 2);
});

test("private or missing packages prevent installer publication after bounded retries", async () => {
  for (const status of [401, 403, 404]) {
    let calls = 0;
    let waits = 0;
    await assert.rejects(
      verifyPublicImage("dziksu/synkinema", "1.7.1", {
        request: async () => {
          calls++;
          return response(status);
        },
        wait: async () => waits++,
      }),
      /Make the GHCR package public/,
    );
    assert.equal(calls, 3);
    assert.equal(waits, 2);
  }
});

test("missing version or architecture and invalid token cannot pass", async () => {
  for (const [token, manifest, message] of [
    [{}, response(200, index), /anonymous pull token/],
    [{ token: "anonymous" }, response(404), /Anonymous manifest read/],
    [
      { token: "anonymous" },
      response(200, { manifests: index.manifests.slice(0, 1) }),
      /linux\/arm64/,
    ],
  ]) {
    await assert.rejects(
      verifyPublicImage("dziksu/synkinema", "1.7.1", {
        attempts: 1,
        request: async (url) =>
          url.includes("/token?") ? response(200, token) : manifest,
      }),
      message,
    );
  }
});

test("transient registry failure can recover without changing the target version", async () => {
  let tokens = 0;
  let waits = 0;
  await verifyPublicImage("dziksu/synkinema", "1.7.1", {
    request: async (url) => {
      if (url.includes("/token?")) {
        return ++tokens === 1
          ? response(503)
          : response(200, { access_token: "anonymous" });
      }
      assert.ok(url.endsWith("/manifests/v1.7.1"));
      return response(200, index);
    },
    wait: async () => waits++,
  });
  assert.equal(tokens, 2);
  assert.equal(waits, 1);
  await assert.rejects(
    verifyPublicImage("dziksu/synkinema", "latest"),
    /Invalid public image identity/,
  );
});

test("publication checks anonymous access after the image and before installer upload", () => {
  const release = readFileSync(
    new URL("../../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  assert.ok(
    release.indexOf("node scripts/release/public-image.mjs") >
      release.indexOf("push: true"),
  );
  const helper = readFileSync(
    new URL("../../.github/workflows/local-helper.yml", import.meta.url),
    "utf8",
  );
  const check = helper.indexOf("node scripts/release/public-image.mjs");
  assert.ok(check > helper.indexOf("node scripts/release/image-tags.mjs"));
  assert.ok(check < helper.indexOf("gh release upload"));
});
