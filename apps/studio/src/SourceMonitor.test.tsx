// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SourceMonitor from "./SourceMonitor";
import { sourceMime } from "./sourceInsert";
import { useStudio } from "./store";
import type { Asset, Track } from "./types";
const asset = {
  id: "film",
  name: "Trailer",
  kind: "video",
  url: "/trailer.mp4",
  duration_ms: 10000,
  has_audio: true,
} as Asset;
const tracks = [
  {
    id: "v",
    kind: "video",
    name: "Obraz",
    clips: [],
    muted: false,
    ducking: false,
    gain_db: 0,
  },
  {
    id: "a",
    kind: "music",
    name: "Music",
    clips: [],
    muted: false,
    ducking: false,
    gain_db: 0,
  },
] as Track[];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useStudio.setState({ draggingAsset: null, draggingSource: null });
});
function setup() {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const insert = vi.fn();
  const view = render(
    <SourceMonitor
      asset={asset}
      tracks={tracks}
      fps={30}
      busy={false}
      onClose={() => {}}
      onInsert={insert}
    />,
  );
  const video = view.container.querySelector("video")!;
  fireEvent.loadedMetadata(video);
  useStudio.setState({ time: 4000 });
  return { ...view, insert, video };
}
it("marks an in/out range and adds exactly that range with both streams", () => {
  const { insert, video } = setup();
  video.currentTime = 2;
  fireEvent.timeUpdate(video);
  fireEvent.click(screen.getByRole("button", { name: "Set In · I" }));
  video.currentTime = 4.5;
  fireEvent.timeUpdate(video);
  fireEvent.click(screen.getByRole("button", { name: "Set Out · O" }));
  fireEvent.click(screen.getByRole("button", { name: "Insert at playhead" }));
  expect(insert).toHaveBeenCalledWith({
    asset_id: "film",
    source_in_ms: 2000,
    duration_ms: 2500,
    mode: "both",
    audio_track_id: "a",
    track_id: "v",
    start_ms: 4000,
  });
  const setData = vi.fn();
  fireEvent.dragStart(
    screen.getByRole("button", { name: /Drag source range/ }),
    { dataTransfer: { setData } },
  );
  expect(setData).toHaveBeenCalledWith(
    sourceMime,
    JSON.stringify({
      asset_id: "film",
      source_in_ms: 2000,
      duration_ms: 2500,
      mode: "both",
      audio_track_id: "a",
    }),
  );
  expect(useStudio.getState().draggingSource?.duration_ms).toBe(2500);
});
it("audio-only selection switches to an audio track and media errors disable insertion", () => {
  const { insert, video } = setup();
  fireEvent.change(screen.getByRole("combobox", { name: "Source streams" }), {
    target: { value: "audio" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Append to track" }));
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "audio", track_id: "a", append: true }),
  );
  fireEvent.error(video);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Insert at playhead",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it("supports in/out shortcuts after clicking transport controls without hijacking typed numbers", () => {
  const { video, insert } = setup();
  video.currentTime = 2;
  fireEvent.timeUpdate(video);
  fireEvent.keyDown(screen.getByRole("button", { name: "Play source range" }), {
    key: "i",
  });
  video.currentTime = 3;
  fireEvent.timeUpdate(video);
  fireEvent.keyDown(screen.getByRole("button", { name: "Play source range" }), {
    key: "o",
  });
  fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Source In (s)" }), {
    key: "i",
  });
  fireEvent.click(screen.getByRole("button", { name: "Insert at playhead" }));
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({ source_in_ms: 2000, duration_ms: 1000 }),
  );
});
