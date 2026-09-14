import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { writes } from "./mutations";
import { reads, keys } from "./queries";
import type { Asset } from "./generated/client";
let client: QueryClient;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
const a: Asset = {
  audio_duration_ms: null,
  checksum: "qa",
  codec: null,
  created_at: "2026-09-12",
  duration_ms: 3000,
  has_audio: false,
  height: 128,
  width: 128,
  kind: "image",
  path: "assets/qa.png",
  size: 120,
  url: "/media/qa.png",
  thumbnail_url: null,
  id: "a",
  version: 3,
  name: "Bird",
  tags: ["nature"],
  source: "Author",
  license: "CC0",
  locations: { library: "images", p: "" },
};
const b = { ...a, id: "b", name: "Private", locations: { p: "" } };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { resolve, promise };
}
const get = (key = keys.inventory) => client.getQueryData<Asset[]>(key)!;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(keys.inventory, [a, b]);
  client.setQueryData(keys.assets(), [a]);
  client.setQueryData(keys.assets("p"), [a, b]);
  request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});
it("rejects stale metadata, restores all collections and preserves a later queued tag edit", async () => {
  const first = deferred(),
    second = deferred();
  request
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const edit = client
    .getMutationCache()
    .build(client, writes.assetMetadata(client))
    .execute({
      assetId: "a",
      request: {
        expected_version: 3,
        name: "Renamed",
        tags: ["nature"],
        source: "Author",
        license: "CC0",
      },
    })
    .catch((e) => e);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const tags = client
    .getMutationCache()
    .build(client, writes.mediaBatch(client))
    .execute({ asset_ids: ["b"], action: "add_tags", tags: ["new"] });
  await vi.waitFor(() => expect(get()[1].tags).toContain("new"));
  expect(get()[0].name).toBe("Renamed");
  await client.fetchQuery(reads.inventory(client));
  expect(request).toHaveBeenCalledOnce();
  first.resolve(json({ detail: "Asset changed" }, 409));
  await edit;
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(get()[0]).toEqual(a);
  expect(get()[1].tags).toContain("new");
  second.resolve(json([{ ...b, version: 4, tags: ["nature", "new"] }]));
  await tags;
  expect(client.getQueryData<Asset[]>(keys.assets("p"))![1].version).toBe(4);
  expect(
    JSON.parse(request.mock.calls[0][1]!.body as string).expected_version,
  ).toBe(3);
});
it("shares selected private media optimistically and rolls back scope membership on error", async () => {
  const reply = deferred();
  request.mockReturnValue(reply.promise);
  const done = client
    .getMutationCache()
    .build(client, writes.mediaBatch(client))
    .execute({
      asset_ids: ["b"],
      action: "locate",
      destination: { folder_id: "images" },
    })
    .catch((e) => e);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(client.getQueryData<Asset[]>(keys.assets())!.map((a) => a.id)).toEqual(
    ["a", "b"],
  );
  expect(get()[1].locations).toEqual({ p: "", library: "images" });
  reply.resolve(json({ detail: "Folder no longer exists" }, 404));
  await done;
  expect(client.getQueryData(keys.assets())).toEqual([a]);
  expect(get()[1].locations).toEqual({ p: "" });
});
it("unsharing keeps private access and uses the confirmed asset version", async () => {
  client.setQueryData(keys.assetUsage("a"), {
    asset_id: "a",
    version: 3,
    can_delete: false,
    projects: [{ project_id: "p", current: true, revisions: [2], job_ids: [] }],
  });
  const reply = deferred();
  request.mockReturnValue(reply.promise);
  const done = client
    .getMutationCache()
    .build(client, writes.removeMediaMembership(client))
    .execute({ assetId: "a", request: { expected_version: 3 } });
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(client.getQueryData(keys.assets())).toEqual([]);
  expect(get()[0].locations).toEqual({ p: "" });
  reply.resolve(json({ ...a, version: 4, locations: { p: "" } }));
  await done;
  expect(client.getQueryData<Asset[]>(keys.assets("p"))![0].version).toBe(4);
  expect(request.mock.calls[0][1]?.method).toBe("DELETE");
});
it("failed physical deletion restores every selected file; success removes usage caches", async () => {
  const payload = {
    assets: [
      { id: "a", expected_version: 3 },
      { id: "b", expected_version: 3 },
    ],
  };
  const reply = deferred();
  request.mockReturnValueOnce(reply.promise);
  const failed = client
    .getMutationCache()
    .build(client, writes.deleteMedia(client))
    .execute(payload)
    .catch((e) => e);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(get()).toEqual([]);
  reply.resolve(json({ detail: "Source used in project history" }, 409));
  expect(await failed).toMatchObject({
    status: 409,
    message: "Source used in project history",
  });
  expect(get()).toEqual([a, b]);
  expect(client.getQueryData(keys.assets())).toEqual([a]);
  client.setQueryData(keys.assetUsage("b"), {
    asset_id: "b",
    can_delete: true,
  });
  request.mockResolvedValue(
    json({
      asset_ids: ["b"],
      job_ids: [],
      project_ids: [],
      deleted_files: 2,
      freed_bytes: 321,
      pending_files: 0,
    }),
  );
  await client
    .getMutationCache()
    .build(client, writes.deleteMedia(client))
    .execute({ assets: [{ id: "b", expected_version: 3 }] });
  expect(get()).toEqual([a]);
  expect(client.getQueryData(keys.assetUsage("b"))).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(2);
});
it("removing a folder moves media to root with rollback and confirmed versions", async () => {
  client.setQueryData(keys.folders(), [{ id: "images", name: "Images" }]);
  request.mockResolvedValueOnce(json({ detail: "Offline" }, 503));
  await expect(
    client
      .getMutationCache()
      .build(client, writes.deleteFolder(client))
      .execute({ folderId: "images" }),
  ).rejects.toThrow();
  expect(get()[0].locations.library).toBe("images");
  expect(client.getQueryData(keys.folders())).toHaveLength(1);
  request.mockResolvedValueOnce(
    json({
      folder_id: "images",
      project_id: null,
      assets: [{ ...a, version: 4, locations: { library: "", p: "" } }],
    }),
  );
  await client
    .getMutationCache()
    .build(client, writes.deleteFolder(client))
    .execute({ folderId: "images" });
  expect(get()[0].locations).toEqual({ library: "", p: "" });
  expect(get()[0].version).toBe(4);
  expect(client.getQueryData(keys.folders())).toEqual([]);
});
