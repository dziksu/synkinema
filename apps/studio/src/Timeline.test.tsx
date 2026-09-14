// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import Timeline from "./Timeline";
import type { Project, Asset, Clip } from "./types";
import { useStudio } from "./store";
const asset = {
  id: "film",
  kind: "video",
  has_audio: true,
  duration_ms: 10000,
  name: "Test.mp4",
} as Asset;
import defaults from "./api/generated/defaults.json";
const clip = {
  ...defaults.clip,
  transform: {
    scale: 1,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    fit: "cover",
  },
  effects: [],
  text: "",
  subtitle: "",
  color: "#ffffff",
  font_size: 80,
  text_y: 0.66,
  id: "clip",
  asset_id: "film",
  name: "Test.mp4",
  start_ms: 1000,
  duration_ms: 4000,
  source_in_ms: 2000,
  speed: 1,
  fade_in_ms: 0,
  fade_out_ms: 0,
  gain_db: 0,
  animations: [],
  transition: { type: "cut", duration_ms: 0 },
} as Clip;
const project = {
  duration_ms: 5000,
  profile: { fps: 30 },
  tracks: [
    { id: "v", kind: "video", name: "Obraz", clips: [clip] },
    { id: "a", kind: "sound", name: "Audio", clips: [] },
    { id: "t", kind: "text", name: "Captions", clips: [] },
  ],
} as unknown as Project;
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("DragEvent", MouseEvent);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1200,
    bottom: 800,
    width: 1200,
    height: 800,
    toJSON: () => ({}),
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  useStudio.setState({
    time: 0,
    selectedId: null,
    draggingAsset: null,
    draggingSource: null,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  const edit = vi.fn();
  const view = render(
    <Timeline
      project={project}
      assets={[asset]}
      zoom={1}
      reviews={[]}
      onEdit={edit}
    />,
  );
  return { edit, ...view };
}
it("clears selection on empty timeline background while clip clicks and toolbar controls preserve it", () => {
  const { container } = mount();
  const button = screen.getByRole("button", { name: "Clip Test.mp4" });
  fireEvent.pointerDown(button, { button: 0 });
  fireEvent.pointerUp(button);
  expect(useStudio.getState().selectedId).toBe("clip");
  fireEvent.pointerDown(
    screen.getByRole("slider", { name: "Timeline playhead" }),
    { button: 0, clientX: 300 },
  );
  expect(useStudio.getState().selectedId).toBe("clip");
  fireEvent.pointerDown(container.querySelector(".timeline-scroll")!);
  expect(useStudio.getState().selectedId).toBeNull();
  fireEvent.pointerDown(button, { button: 0 });
  fireEvent.pointerUp(button);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Mute Audio" }));
  expect(useStudio.getState().selectedId).toBe("clip");
  fireEvent.pointerDown(container.querySelector('[data-track-id="a"]')!, {
    button: 0,
    clientX: 60,
  });
  expect(useStudio.getState().selectedId).toBeNull();
});
it("vertical drag extracts audio preserving source trim and original video", () => {
  const { edit, container } = mount();
  const button = screen.getByRole("button", { name: "Clip Test.mp4" });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => container.querySelector('[data-track-id="a"]'),
  });
  fireEvent.pointerDown(button, { button: 0, clientX: 300, clientY: 40 });
  fireEvent.pointerMove(button, { clientX: 300, clientY: 100 });
  fireEvent.pointerUp(button);
  expect(edit).toHaveBeenCalledExactlyOnceWith("add_clip", {
    track_id: "a",
    clip: expect.objectContaining({
      asset_id: "film",
      start_ms: 1000,
      duration_ms: 4000,
      source_in_ms: 2000,
      speed: 1,
    }),
  });
  expect(screen.getByRole("button", { name: "Clip Test.mp4" })).toBeTruthy();
});
it("rejects dropping video on a text lane", () => {
  const { edit, container } = mount();
  const button = screen.getByRole("button", { name: "Clip Test.mp4" });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => container.querySelector('[data-track-id="t"]'),
  });
  fireEvent.pointerDown(button, { button: 0, clientX: 300, clientY: 40 });
  fireEvent.pointerMove(button, { clientX: 300, clientY: 160 });
  expect(screen.getByRole("status").textContent).toContain("not compatible");
  fireEvent.pointerUp(button);
  expect(edit).not.toHaveBeenCalled();
});
it("Escape cancels a pending drag without writing", () => {
  const { edit, container } = mount();
  const button = screen.getByRole("button", { name: "Clip Test.mp4" });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => container.querySelector('[data-track-id="a"]'),
  });
  fireEvent.pointerDown(button, { button: 0, clientX: 300, clientY: 40 });
  fireEvent.pointerMove(button, { clientX: 300, clientY: 100 });
  fireEvent.keyDown(button, { key: "Escape" });
  fireEvent.pointerUp(button);
  expect(edit).not.toHaveBeenCalled();
});
it("left handle trims source and right edge together", () => {
  const { edit, container } = mount();
  const button = screen.getByRole("button", { name: "Clip Test.mp4" });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => container.querySelector('[data-track-id="v"]'),
  });
  fireEvent.pointerDown(container.querySelector('[data-trim="left"]')!, {
    button: 0,
    clientX: 300,
    clientY: 40,
  });
  fireEvent.pointerMove(button, { clientX: 360, clientY: 40 });
  fireEvent.pointerUp(button);
  expect(edit).toHaveBeenCalledWith("trim_clip", {
    track_id: "v",
    clip_id: "clip",
    changes: expect.objectContaining({
      start_ms: 2000,
      duration_ms: 3000,
      source_in_ms: 3000,
    }),
  });
});
it("dropping an asset snaps even if no dragover fired", () => {
  const { edit, container } = mount();
  fireEvent.drop(container.querySelector('[data-track-id="a"]')!, {
    clientX: 2,
    dataTransfer: {
      getData: (type: string) =>
        type === "application/synkinema-asset" ? asset.id : "",
    },
  });
  expect(edit).toHaveBeenCalledWith("add_clip", {
    track_id: "a",
    clip: expect.objectContaining({ start_ms: 0, asset_id: "film" }),
  });
});
it("drops tagged SFX at the conservative library gain", () => {
  const edit = vi.fn();
  const sfx = {
    ...asset,
    id: "sfx",
    kind: "audio",
    duration_ms: 600,
    tags: ["sfx"],
  } as Asset;
  const { container } = render(
    <Timeline
      project={project}
      assets={[sfx]}
      zoom={1}
      reviews={[]}
      onEdit={edit}
    />,
  );
  fireEvent.drop(container.querySelector('[data-track-id="a"]')!, {
    clientX: 2,
    dataTransfer: {
      getData: (type: string) =>
        type === "application/synkinema-asset" ? "sfx" : "",
    },
  });
  expect(edit).toHaveBeenCalledWith("add_clip", {
    track_id: "a",
    clip: expect.objectContaining({
      asset_id: "sfx",
      duration_ms: 600,
      gain_db: -12,
    }),
  });
});

it("drops a selected source range with its audio intent instead of the full file", () => {
  const { edit, container } = mount();
  const selection = {
    asset_id: "film",
    source_in_ms: 2000,
    duration_ms: 1000,
    mode: "both",
    audio_track_id: "a",
  };
  useStudio.setState({
    draggingAsset: "film",
    draggingSource: selection as import("./sourceInsert").SourceSelection,
  });
  fireEvent.drop(container.querySelector('[data-track-id="v"]')!, {
    clientX: 360,
    dataTransfer: {
      getData: (type: string) =>
        type === "application/synkinema-source"
          ? JSON.stringify(selection)
          : type === "application/synkinema-asset"
            ? "film"
            : "",
    },
  });
  expect(edit).toHaveBeenCalledWith("insert_source", {
    ...selection,
    track_id: "v",
    start_ms: 6000,
  });
  expect(useStudio.getState().draggingSource).toBeNull();
});
