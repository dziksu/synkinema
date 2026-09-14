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
import MediaBrowser from "./MediaBrowser";
import { http } from "./api/transport";
import type { Asset, Project } from "./types";
vi.mock("./api/transport", () => ({
  http: { api: { assetFolders: vi.fn(), locateAsset: vi.fn() } },
}));
const privateAsset = {
  id: "private",
  name: "Private logo",
  kind: "image",
  tags: [],
  locations: { p: "" },
} as unknown as Asset;
const shared = {
  id: "shared",
  name: "Whoosh",
  kind: "audio",
  tags: ["sfx"],
  duration_ms: 1000,
  locations: { library: "sfx" },
} as unknown as Asset;
beforeEach(() => {
  vi.mocked(http.api.assetFolders).mockResolvedValue([
    { id: "sfx", name: "Sound effects" },
  ]);
  vi.mocked(http.api.locateAsset).mockResolvedValue(shared);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup() {
  const destination = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MediaBrowser
        project={{ id: "p" } as Project}
        projectAssets={[privateAsset]}
        libraryAssets={[shared]}
        onAdd={() => {}}
        onOverlay={() => {}}
        onPreview={() => {}}
        onImport={() => {}}
        onDestination={destination}
        onError={() => {}}
      />
    </QueryClientProvider>,
  );
  return destination;
}
it("separates private project media from shared library and updates upload destination", async () => {
  const destination = setup();
  expect(screen.getByRole("button", { name: /IMG Private logo/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /1.0 s Whoosh/ })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Library" }));
  expect(
    await screen.findByRole("button", { name: /1.0 s Whoosh/ }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /IMG Private logo/ })).toBeNull();
  await waitFor(() =>
    expect(destination).toHaveBeenLastCalledWith({
      project_id: undefined,
      folder_id: undefined,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
  fireEvent.click(await screen.findByRole("button", { name: /Sound effects/ }));
  await waitFor(() =>
    expect(destination).toHaveBeenLastCalledWith({
      project_id: undefined,
      folder_id: "sfx",
    }),
  );
});
it("dropping media onto a folder sends a scoped membership update", async () => {
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "Library" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
  const folder = await screen.findByRole("button", { name: /Sound effects/ });
  fireEvent.pointerDown(screen.getByRole("button", { name: "1.0 s Whoosh" }));
  expect(screen.getByRole("button", { name: /Sound effects/ })).toBeTruthy();
  fireEvent.drop(folder, { dataTransfer: { getData: () => "shared" } });
  await waitFor(() =>
    expect(http.api.locateAsset).toHaveBeenCalledWith("shared", {
      project_id: undefined,
      folder_id: "sfx",
    }),
  );
});
