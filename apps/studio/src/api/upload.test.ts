import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { Api, type Asset, type AssetLocation } from "@/api/generated/client";
import { writes } from "@/api/mutations";
import { keys } from "@/api/queries";
import { http } from "@/api/transport";

afterEach(() => vi.restoreAllMocks());

const asset: Asset = {
  id: "uploaded-video",
  name: "clip.mp4",
  kind: "video",
  locations: {},
  duration_ms: 3000,
  audio_duration_ms: null,
  has_audio: false,
  width: 640,
  height: 360,
  codec: "h264",
  size: 5,
  checksum: "checksum",
  created_at: "2026-10-14",
  path: "library/clip.mp4",
  url: "/media/library/clip.mp4",
  thumbnail_url: null,
  source: "",
  license: "",
  tags: [],
  version: 1,
};

it.each<AssetLocation>([
  {},
  { project_id: undefined, folder_id: undefined },
  { project_id: null, folder_id: null },
  { project_id: "project", folder_id: undefined },
  { project_id: "project", folder_id: null },
  { project_id: "project", folder_id: "private-folder" },
  { project_id: undefined, folder_id: "shared-folder" },
])(
  "serializes upload destination %j without absent multipart fields",
  async (destination) => {
    const client = new QueryClient();
    const scope = destination.project_id || "library";
    const confirmed = {
      ...asset,
      locations: { [scope]: destination.folder_id || "" },
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const form = init!.body as FormData;
      expect(form.get("file")).toBeInstanceOf(Blob);
      expect(await (form.get("file") as Blob).text()).toBe("video");
      expect(form.get("project_id")).toBe(destination.project_id || null);
      expect(form.get("folder_id")).toBe(destination.folder_id || null);
      return Response.json(confirmed);
    });
    // Exercise the generated client's real multipart serializer, not just its inputs.
    const api = new Api({ customFetch: fetch });
    vi.spyOn(http.api, "upload").mockImplementation(api.api.upload);
    const observer = new MutationObserver(client, writes.upload(client));
    try {
      await observer.mutate({
        files: [new File(["video"], "clip.mp4", { type: "video/mp4" })],
        destination,
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(client.getQueryData(keys.assets(destination.project_id))).toEqual([
        confirmed,
      ]);
      expect(
        client.getQueryData(
          keys.assets(scope === "library" ? "other" : undefined),
        ),
      ).toBeUndefined();
    } finally {
      client.clear();
    }
  },
);

it("keeps failed uploads out of the playable asset cache and does not retry", async () => {
  const client = new QueryClient();
  client.setQueryData(keys.assets("project"), [asset]);
  const upload = vi
    .spyOn(http.api, "upload")
    .mockRejectedValue(new Error("Cannot decode this media file"));
  const observer = new MutationObserver(client, writes.upload(client));
  try {
    await expect(
      observer.mutate({
        files: [new File(["invalid"], "broken.mp4")],
        destination: { project_id: "project", folder_id: undefined },
      }),
    ).rejects.toThrow("Cannot decode this media file");
    expect(upload).toHaveBeenCalledOnce();
    expect(client.getQueryData(keys.assets("project"))).toEqual([asset]);
  } finally {
    client.clear();
  }
});
