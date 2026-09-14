// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProjectThumbnail, { projectThumbnailSources } from "./ProjectThumbnail";
import App from "./App";
import { useStudio } from "./store";
import { keys } from "./api/queries";
import defaults from "./api/generated/defaults.json";
import type { Asset, Clip, Project, Track } from "./types";

const asset = (id: string, changes: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  kind: "video",
  version: 1,
  checksum: id,
  path: `assets/${id}.mp4`,
  url: `/media/assets/${id}.mp4`,
  thumbnail_url: `/media/thumbs/${id}.jpg`,
  locations: { private: "" },
  tags: [],
  source: "",
  license: "",
  created_at: "2026-09-14",
  duration_ms: 1000,
  audio_duration_ms: null,
  codec: null,
  has_audio: false,
  width: 1920,
  height: 1080,
  size: 100,
  ...changes,
});
const clip = (asset_id: string, start_ms = 0): Clip =>
  ({
    ...defaults.clip,
    id: asset_id,
    asset_id,
    start_ms,
  }) as Clip;
const track = (kind: Track["kind"], clips: Clip[], muted = false): Track => ({
  ...defaults.track,
  id: kind,
  name: kind,
  kind,
  clips,
  muted,
});
const project = (tracks: Track[]): Project =>
  ({
    ...defaults.project,
    id: "private",
    name: "Private footage",
    tracks,
  }) as Project;

let client: QueryClient | undefined;
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("uses the earliest main visual clip, skipping audio, muted and missing sources", () => {
  const p = project([
    track("voiceover", [clip("narration")]),
    track("overlay", [clip("logo")]),
    track("video", [clip("muted")], true),
    track("video", [clip("later", 3000), clip("missing"), clip("first", 100)]),
  ]);
  const sources = projectThumbnailSources(p, [
    asset("narration", { kind: "audio" }),
    asset("logo"),
    asset("muted"),
    asset("first"),
    asset("later"),
  ]);
  expect(sources).toEqual([
    "/media/thumbs/first.jpg",
    "/media/thumbs/later.jpg",
    "/media/thumbs/logo.jpg",
  ]);
});

it("falls back from broken thumbnails to original images and then a safe placeholder", () => {
  const p = project([track("overlay", [clip("photo"), clip("photo", 1000)])]);
  const photo = asset("photo", { kind: "image", url: "/media/photo.png" });
  const { container, rerender } = render(
    <ProjectThumbnail project={p} assets={[photo]} />,
  );
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    photo.thumbnail_url,
  );
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(photo.url);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
  rerender(
    <ProjectThumbnail
      project={p}
      assets={[{ ...photo, thumbnail_url: "/media/repaired.jpg" }]}
    />,
  );
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "/media/repaired.jpg",
  );
});

it("supports images without thumbnails and leaves empty/audio-only projects as placeholders", () => {
  const image = asset("photo", {
    kind: "image",
    thumbnail_url: null,
    url: "/media/photo.png",
  });
  expect(
    projectThumbnailSources(project([track("video", [clip("photo")])]), [
      image,
    ]),
  ).toEqual([image.url]);
  expect(projectThumbnailSources(project([]), [image])).toEqual([]);
  expect(
    projectThumbnailSources(project([track("music", [clip("photo")])]), [
      image,
    ]),
  ).toEqual([]);
});

it("loads private covers on Projects without opening a project or mixing library scopes", async () => {
  const p = project([track("video", [clip("private-video")])]);
  const privateVideo = asset("private-video");
  let inventory = [privateVideo];
  const request = vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    const data =
      path === "/api/projects"
        ? [p]
        : path === "/api/media"
          ? inventory
          : path === "/api/state"
            ? { projects: [{ id: p.id, revision: p.revision }], jobs: [] }
            : [];
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", request);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  useStudio.setState({ page: "projects", projectId: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      container.querySelector(".project-cover img")?.getAttribute("src"),
    ).toBe(privateVideo.thumbnail_url),
  );
  expect(client.getQueryData(keys.assets())).toEqual([]);
  expect(client.getQueryData(keys.inventory)).toEqual([privateVideo]);
  expect(
    request.mock.calls.filter(([url]) => String(url) === "/api/media"),
  ).toHaveLength(1);
  expect(
    request.mock.calls.some(([url]) => String(url).includes("project_id=")),
  ).toBe(false);
  inventory = [{ ...privateVideo, thumbnail_url: "/media/updated.jpg" }];
  await act(async () => {
    await client!.invalidateQueries({ queryKey: keys.inventory });
  });
  await waitFor(() =>
    expect(
      container.querySelector(".project-cover img")?.getAttribute("src"),
    ).toBe("/media/updated.jpg"),
  );
});
