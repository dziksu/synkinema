// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MediaLibrary from "./MediaLibrary";
import { http } from "./api/transport";
import { keys } from "./api/queries";
import type { Asset } from "./types";
vi.mock("./api/transport", () => ({
  http: {
    api: {
      assetInventory: vi.fn(),
      assetFolders: vi.fn(),
      projects: vi.fn(),
      assetUsage: vi.fn(),
      updateAsset: vi.fn(),
      batchAssets: vi.fn(),
      removeAssetLocation: vi.fn(),
    },
  },
}));
let client: QueryClient;
let assets: Asset[];
const source: Asset = {
  audio_duration_ms: null,
  checksum: "qa",
  codec: null,
  has_audio: false,
  height: 128,
  width: 128,
  path: "assets/a.mp4",
  thumbnail_url: null,
  id: "a",
  version: 1,
  name: "Bird",
  kind: "video",
  tags: ["nature"],
  source: "Creator",
  license: "CC0",
  locations: { library: "images" },
  url: "/media/a.mp4",
  size: 1234,
  created_at: "2026-09-12",
  duration_ms: 3000,
};
beforeEach(() => {
  assets = [
    source,
    {
      ...source,
      id: "b",
      name: "Private logo",
      kind: "image",
      locations: { p: "" },
    },
  ];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(http.api.assetInventory).mockImplementation(async () => assets);
  vi.mocked(http.api.assetFolders).mockResolvedValue([
    { id: "images", name: "Images" },
  ]);
  vi.mocked(http.api.projects).mockResolvedValue([]);
  vi.mocked(http.api.assetUsage).mockResolvedValue({
    asset_id: "a",
    version: 1,
    can_delete: false,
    projects: [
      {
        project_id: "p",
        name: "Wildlife",
        current: false,
        revisions: [2],
        job_ids: [],
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});
function setup() {
  return render(
    <QueryClientProvider client={client}>
      <MediaLibrary onDestination={() => {}} onNotice={() => {}} />
    </QueryClientProvider>,
  );
}
it("defaults to shared media, exposes private inventory deliberately and opens only one player", async () => {
  const { container } = setup();
  await screen.findByRole("button", { name: "Manage Bird" });
  expect(
    screen.queryByRole("button", { name: "Manage Private logo" }),
  ).toBeNull();
  expect(container.querySelectorAll("video,audio")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /All stored media/ }));
  await screen.findByRole("button", { name: "Manage Private logo" });
  fireEvent.click(screen.getByRole("button", { name: "Manage Bird" }));
  await screen.findByRole("dialog");
  expect(document.querySelectorAll("video,audio")).toHaveLength(1);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Delete from disk",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("tab", { name: "Sharing & usage" }));
  expect(
    await screen.findByText("Kept for project history", { exact: false }),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Remove from shared library",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it("plays a library item from its tile without opening its management dialog", async () => {
  const { container } = setup();
  await screen.findByRole("button", { name: "Manage Bird" });
  fireEvent.click(
    screen.getByRole("button", { name: "Play quick preview Bird" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Stop quick preview Bird" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(container.querySelectorAll("video,audio")).toHaveLength(1);
  expect(screen.getByLabelText("Quick preview Bird").getAttribute("src")).toBe(
    "/media/a.mp4",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Stop quick preview Bird" }),
  );
  expect(container.querySelectorAll("video,audio")).toHaveLength(0);
});
it("uses a compact progress display instead of browser audio controls", async () => {
  assets[1] = {
    ...source,
    id: "b",
    name: "Short sound",
    kind: "audio",
    duration_ms: 1500,
    locations: { library: "" },
    url: "/media/b.mp3",
  };
  const { container } = setup();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Play quick preview Short sound",
    }),
  );
  let audio = container.querySelector("audio");
  expect(audio?.hasAttribute("controls")).toBe(false);
  expect(
    screen.getByRole("status", { name: "Playing audio preview" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Stop quick preview Short sound" }),
  );
  expect(container.querySelector("audio")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Play quick preview Short sound" }),
  );
  audio = container.querySelector("audio");
  const timeline = screen.getByRole("slider", {
    name: "Seek audio preview",
  }) as HTMLInputElement;
  expect(timeline.max).toBe("1500");
  fireEvent.change(timeline, { target: { value: "500" } });
  expect(timeline.value).toBe("500");
  expect(audio?.currentTime).toBe(0.5);
});
it("edits tag chips and metadata explicitly, sending the loaded version", async () => {
  vi.mocked(http.api.updateAsset).mockImplementation(async (_id, body) => {
    const updated = { ...source, ...body, version: 2 };
    assets = [updated, assets[1]];
    return updated;
  });
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Manage Bird" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Media name" }), {
    target: { value: "Polish wildlife" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "New tag" }), {
    target: { value: "protected" },
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "New tag" }), {
    key: "Enter",
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove tag nature" }));
  fireEvent.click(screen.getByRole("button", { name: "Save details" }));
  await waitFor(() =>
    expect(http.api.updateAsset).toHaveBeenCalledWith("a", {
      expected_version: 1,
      name: "Polish wildlife",
      tags: ["protected"],
      source: "Creator",
      license: "CC0",
    }),
  );
  expect(await screen.findByText("Media details saved.")).toBeTruthy();
  expect(client.getQueryData<Asset[]>(keys.inventory)![0].version).toBe(2);
});
it("preserves unsaved text after a conflict and lets the user reload confirmed metadata", async () => {
  vi.mocked(http.api.updateAsset).mockImplementation(async () => {
    assets = [{ ...source, name: "Changed elsewhere", version: 2 }, assets[1]];
    throw new Error("Asset changed");
  });
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Manage Bird" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Media name" }), {
    target: { value: "My draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save details" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    (screen.getByRole("textbox", { name: "Media name" }) as HTMLInputElement)
      .value,
  ).toBe("My draft");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload latest details" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "Media name" }) as HTMLInputElement)
        .value,
    ).toBe("Changed elsewhere"),
  );
});
it("selection drag and drop moves the complete group to a named shared folder", async () => {
  vi.mocked(http.api.batchAssets).mockResolvedValue(
    assets.map((a) => ({
      ...a,
      locations: { ...a.locations, library: "images" },
      version: 2,
    })),
  );
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: /All stored media/ }),
  );
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Select visible media" }),
  );
  fireEvent.drop(screen.getByRole("button", { name: /Images1/ }), {
    dataTransfer: { getData: () => "a" },
  });
  await waitFor(() =>
    expect(http.api.batchAssets).toHaveBeenCalledWith({
      asset_ids: ["a", "b"],
      action: "locate",
      destination: { folder_id: "images" },
    }),
  );
});
it("adds tags to multiple files through the batch dialog", async () => {
  vi.mocked(http.api.batchAssets).mockResolvedValue([
    { ...source, tags: ["nature", "short"], version: 2 },
  ]);
  setup();
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Select media Bird" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
  fireEvent.change(screen.getByRole("textbox", { name: "New tag" }), {
    target: { value: "short" },
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "New tag" }), {
    key: "Enter",
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
  await waitFor(() =>
    expect(http.api.batchAssets).toHaveBeenCalledWith({
      asset_ids: ["a"],
      action: "add_tags",
      tags: ["short"],
      destination: undefined,
    }),
  );
});
