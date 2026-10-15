// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import defaults from "@/api/generated/defaults.json";
import type { Asset, Clip, Project } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import { Preview } from "./Preview";

vi.mock("@/lib/i18n", () => ({ tr: (s: string) => s, useLocale: () => {} }));
vi.mock("./usePreviewSize", () => ({
  usePreviewSize: () => ({ width: 320, height: 180 }),
}));

beforeEach(() => {
  useStudio.getState().set({ time: 1000, playing: false, audioDraft: null });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function view(renderedUrl?: string) {
  const clip = {
    ...defaults.clip,
    id: "picture",
    asset_id: "asset",
    start_ms: 1000,
    source_in_ms: 2000,
    speed: 2,
  } as Clip;
  const project = {
    ...defaults.project,
    id: "preview-seek-test",
    duration_ms: 6000,
    tracks: [
      { ...defaults.track, id: "video", kind: "video", clips: [clip] },
      {
        ...defaults.track,
        id: "audio",
        kind: "music",
        clips: [{ ...clip, id: "sound" }],
      },
    ],
  } as Project;
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(Preview, {
        project,
        assets: [
          { id: "asset", kind: "video", url: "/media/test.mp4" } as Asset,
        ],
        renderedUrl,
        onChange: vi.fn(),
        onInsert: vi.fn(),
      }),
    ),
  );
}

it("seeks both source picture and sound on every paused frame step", () => {
  const { container } = view();
  const media = [
    ...container.querySelectorAll("video, audio"),
  ] as HTMLMediaElement[];
  expect(media).toHaveLength(2);
  expect(media.map((element) => element.currentTime)).toEqual([2, 2]);
  act(() => useStudio.getState().set({ time: 1040 }));
  expect(media.map((element) => element.currentTime)).toEqual([2.08, 2.08]);
  act(() => useStudio.getState().set({ time: 1000 }));
  expect(media.map((element) => element.currentTime)).toEqual([2, 2]);
});

it("seeks a rendered preview on each paused frame step", () => {
  const { container } = view("/media/render.mp4");
  const video = container.querySelector("video")!;
  expect(video.currentTime).toBe(1);
  act(() => useStudio.getState().set({ time: 1040 }));
  expect(video.currentTime).toBe(1.04);
  act(() => useStudio.getState().set({ time: 1000 }));
  expect(video.currentTime).toBe(1);
});

it.each([undefined, "/media/render.mp4"])(
  "retains smooth playback drift tolerance, then aligns precisely when paused (%s)",
  (renderedUrl) => {
    const { container } = view(renderedUrl);
    const video = container.querySelector("video")!;
    const initial = video.currentTime;
    act(() => useStudio.getState().set({ time: 1040, playing: true }));
    expect(video.currentTime).toBe(initial);
    act(() => useStudio.getState().set({ playing: false }));
    expect(video.currentTime).toBe(renderedUrl ? 1.04 : 2.08);
  },
);
