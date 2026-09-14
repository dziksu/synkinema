// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Preview } from "./App";
import ElementPicker from "./ElementPicker";
import { canvasInsert, elementMime } from "./layerInsert";
import { projectAfter } from "./api/projectReducer";
import { useStudio } from "./store";
import defaults from "./api/generated/defaults.json";
import type { Project, Asset, Track, Clip } from "./types";
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("DragEvent", MouseEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  useStudio.setState({ time: 2000, playing: false, selectedId: null });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 1000,
    right: 1000,
    bottom: 1000,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([1, 1.5])(
  "keeps the decoded video across consecutive source cuts at speed %s",
  (speed) => {
    const project = structuredClone(defaults.project) as Project;
    project.id = "continuous-source";
    project.duration_ms = 6000;
    const first = {
      ...structuredClone(defaults.clip),
      id: "first",
      name: "First shot",
      asset_id: "source",
      start_ms: 0,
      source_in_ms: 1000,
      duration_ms: 3000,
      speed,
    } as Clip;
    const second = {
      ...structuredClone(first),
      id: "second",
      name: "Next shot",
      start_ms: 3000,
      source_in_ms: 1000 + 3000 * speed,
    };
    // Restored/edited clips need not be stored in chronological order.
    project.tracks[0].clips = [second, first];
    useStudio.setState({ time: 2999 });
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <Preview
          project={project}
          assets={[
            {
              id: "source",
              kind: "video",
              url: "/media/continuous.mp4",
            } as Asset,
          ]}
          onChange={vi.fn()}
          onInsert={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const decoder = container.querySelector("video")!;
    // Model the already-decoded source position as the playhead crosses the cut.
    const atCut = second.source_in_ms / 1000;
    decoder.currentTime = atCut;
    const seek = vi.spyOn(decoder, "currentTime", "set");
    act(() => useStudio.setState({ time: 3000 }));
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(container.querySelector("video")).toBe(decoder);
    expect(seek).not.toHaveBeenCalled();
    expect(decoder.currentTime).toBe(atCut);
    expect(
      container.querySelector<HTMLElement>(".placed-media")!.style.opacity,
    ).toBe("1");
    expect(
      screen.getByRole("button", { name: "Position Next shot on canvas" }),
    ).toBeTruthy();
  },
);
it("selects canvas elements and clears selection on canvas and surrounding empty background", () => {
  const base = structuredClone(defaults.project) as Project;
  const p = projectAfter(
    base,
    canvasInsert(base, [], { shape: "rectangle", start_ms: 0 }),
  );
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <Preview project={p} assets={[]} onChange={vi.fn()} onInsert={vi.fn()} />
    </QueryClientProvider>,
  );
  const target = container.querySelector(".canvas-target")!;
  fireEvent.pointerDown(target, { button: 0 });
  fireEvent.pointerUp(target);
  expect(useStudio.getState().selectedId).toBe(p.tracks.at(-1)!.clips[0].id);
  fireEvent.pointerDown(container.querySelector(".preview-stage")!);
  expect(useStudio.getState().selectedId).toBeNull();
  fireEvent.pointerDown(target, { button: 0 });
  fireEvent.pointerUp(target);
  fireEvent.pointerDown(container.querySelector(".preview-canvas")!);
  expect(useStudio.getState().selectedId).toBeNull();
});
it("accepts sound/source-range drops at the preview location and shows the playhead time", () => {
  const insert = vi.fn(),
    p = structuredClone(defaults.project) as Project;
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <Preview project={p} assets={[]} onChange={vi.fn()} onInsert={insert} />
    </QueryClientProvider>,
  );
  const canvas = container.querySelector(".preview-canvas")!;
  const source = {
    asset_id: "audio",
    source_in_ms: 400,
    duration_ms: 1200,
    mode: "audio",
  };
  const dataTransfer = {
    types: ["application/synkinema-asset"],
    getData: (type: string) =>
      type === "application/synkinema-asset"
        ? "audio"
        : type === "application/synkinema-source"
          ? JSON.stringify(source)
          : "",
  };
  fireEvent.dragOver(canvas, { dataTransfer });
  expect(container.querySelector(".canvas-drop-label")?.textContent).toContain(
    "00:02.0",
  );
  fireEvent.drop(canvas, { dataTransfer, clientX: 250, clientY: 750 });
  expect(insert).toHaveBeenCalledWith({
    asset_id: "audio",
    source,
    center: { x: 0.25, y: 0.75 },
  });
  expect(container.querySelector(".canvas-drop-label")).toBeNull();
});
it("allows repeated element drags after closing the floating palette mid-drag", () => {
  const insert = vi.fn(),
    change = vi.fn();
  const { rerender } = render(
    <ElementPicker open onOpenChange={change} onInsert={insert} />,
  );
  const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
  fireEvent.dragStart(screen.getByRole("button", { name: "Ellipse" }), {
    dataTransfer,
  });
  expect(dataTransfer.setData).toHaveBeenCalledWith(elementMime, "ellipse");
  expect(document.querySelector(".element-picker.is-dragging")).toBeTruthy();
  rerender(
    <ElementPicker open={false} onOpenChange={change} onInsert={insert} />,
  );
  rerender(<ElementPicker open onOpenChange={change} onInsert={insert} />);
  expect(document.querySelector(".element-picker.is-dragging")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  expect(insert).toHaveBeenCalledWith("rectangle");
});

it("keeps one video decoder and the complete off-frame target while zooming, dragging and resizing", () => {
  const base = structuredClone(defaults.project) as Project;
  const p = projectAfter(
    base,
    canvasInsert(base, [], { shape: "rectangle", start_ms: 0 }),
  );
  const c = p.tracks.at(-1)!.clips[0];
  c.shape = null;
  c.asset_id = "video";
  c.placement = { x: 0, y: 0.5, width: 0.4, height: 0.3 };
  const change = vi.fn();
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <Preview
        project={p}
        assets={[
          {
            id: "video",
            kind: "video",
            url: "/media/assets/test.mp4",
          } as Asset,
        ]}
        onChange={change}
        onInsert={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const target = container.querySelector<HTMLElement>(".canvas-target")!;
  expect(target.style.left).toBe("-20%");
  expect(target.style.width).toBe("40%");
  const canvas = container.querySelector<HTMLElement>(".preview-canvas")!;
  const fitWidth = Number.parseFloat(canvas.style.width);
  fireEvent.change(screen.getByRole("combobox", { name: "Preview zoom" }), {
    target: { value: "0.5" },
  });
  expect(Number.parseFloat(canvas.style.width)).toBeCloseTo(fitWidth / 2);
  expect(container.querySelectorAll("video")).toHaveLength(1);
  // A pointer may start beyond the frame. The draft uses frame pixels, not stage pixels.
  fireEvent.pointerDown(target, { button: 0, clientX: -100, clientY: 500 });
  fireEvent.pointerMove(target, { clientX: 100, clientY: 500 });
  fireEvent.pointerUp(target);
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.calls[0][2].placement).toEqual({
    x: 0.2,
    y: 0.5,
    width: 0.4,
    height: 0.3,
  });
  const nw = container.querySelector('[data-corner="nw"]')!;
  fireEvent.pointerDown(nw, { button: 0, clientX: -200, clientY: 350 });
  fireEvent.pointerMove(target, { clientX: -300, clientY: 350 });
  fireEvent.pointerUp(target);
  expect(change.mock.calls[1][2].placement.width).toBeCloseTo(0.5);
  expect(container.querySelectorAll("video")).toHaveLength(1);
});

it("keeps the released position until the optimistic edit settles, including rollback", async () => {
  const p = projectAfter(
    structuredClone(defaults.project) as Project,
    canvasInsert(structuredClone(defaults.project) as Project, [], {
      shape: "rectangle",
      start_ms: 0,
    }),
  );
  let settle!: () => void;
  const change = vi.fn<
    (track: Track, clip: Clip, changes: Partial<Clip>) => Promise<void>
  >(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  const draw = (project: Project) => (
    <QueryClientProvider client={new QueryClient()}>
      <Preview
        project={project}
        assets={[]}
        onChange={change}
        onInsert={vi.fn()}
      />
    </QueryClientProvider>
  );
  const view = render(draw(p));
  const target = view.container.querySelector(".canvas-target")!;
  const shape = view.container.querySelector<HTMLElement>(".preview-shape")!;
  const originalLeft = shape.style.left;
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { clientX: 240, clientY: 170 });
  const movedLeft = shape.style.left;
  expect(movedLeft).not.toBe(originalLeft);
  fireEvent.pointerUp(target);
  expect(shape.style.left).toBe(movedLeft);
  // The asynchronous mutation has not projected yet; a normal parent rerender
  // must not make the layer jump back to the confirmed position.
  view.rerender(draw(structuredClone(p)));
  expect(shape.style.left).toBe(movedLeft);
  const projected = structuredClone(p);
  Object.assign(projected.tracks.at(-1)!.clips[0], change.mock.calls[0][2]);
  view.rerender(draw(projected));
  expect(shape.style.left).toBe(movedLeft);
  // A failed save rolls Query back before the edit promise settles.
  view.rerender(draw(p));
  await act(async () => settle());
  expect(shape.style.left).toBe(originalLeft);
});

it("does not restart media synchronization for placement-only pointer updates", () => {
  const p = projectAfter(
    structuredClone(defaults.project) as Project,
    canvasInsert(structuredClone(defaults.project) as Project, [], {
      shape: "rectangle",
      start_ms: 0,
    }),
  );
  const clip = p.tracks.at(-1)!.clips[0];
  clip.shape = null;
  clip.asset_id = "video";
  const client = new QueryClient();
  const draw = (url: string) => (
    <QueryClientProvider client={client}>
      <Preview
        project={p}
        assets={[
          {
            id: "video",
            kind: "video",
            url,
          } as Asset,
        ]}
        onChange={vi.fn()}
        onInsert={vi.fn()}
      />
    </QueryClientProvider>
  );
  const { container, rerender } = render(draw("/media/assets/test.mp4"));
  const video = container.querySelector("video");
  const target = container.querySelector(".canvas-target")!;
  const pause = vi.mocked(HTMLMediaElement.prototype.pause);
  const before = pause.mock.calls.length;
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
  for (const x of [130, 170, 200])
    fireEvent.pointerMove(target, { clientX: x, clientY: 120 });
  expect(container.querySelector("video")).toBe(video);
  expect(pause).toHaveBeenCalledTimes(before);
  rerender(draw("/media/assets/replacement.mp4"));
  expect(video?.getAttribute("src")).toBe("/media/assets/replacement.mp4");
  expect(pause).toHaveBeenCalledTimes(before + 1);
});

it("a late save cannot clear a newer drag, and Escape restores the projected position", async () => {
  const base = structuredClone(defaults.project) as Project;
  const project = projectAfter(
    base,
    canvasInsert(base, [], { shape: "rectangle", start_ms: 0 }),
  );
  let settle!: () => void;
  const change = vi.fn<
    (track: Track, clip: Clip, changes: Partial<Clip>) => Promise<void>
  >(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  const client = new QueryClient();
  const draw = (p: Project) => (
    <QueryClientProvider client={client}>
      <Preview project={p} assets={[]} onChange={change} onInsert={vi.fn()} />
    </QueryClientProvider>
  );
  const view = render(draw(project));
  const target = view.container.querySelector(".canvas-target")!;
  const shape = view.container.querySelector<HTMLElement>(".preview-shape")!;
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { clientX: 200, clientY: 100 });
  fireEvent.pointerUp(target);
  const firstLeft = shape.style.left;
  const projected = structuredClone(project);
  Object.assign(projected.tracks.at(-1)!.clips[0], change.mock.calls[0][2]);
  view.rerender(draw(projected));
  fireEvent.pointerDown(target, { button: 0, clientX: 200, clientY: 100 });
  fireEvent.pointerMove(target, { clientX: 300, clientY: 200 });
  const secondLeft = shape.style.left;
  expect(secondLeft).not.toBe(firstLeft);
  await act(async () => settle());
  expect(shape.style.left).toBe(secondLeft);
  fireEvent.keyDown(target, { key: "Escape" });
  fireEvent.pointerUp(target);
  expect(shape.style.left).toBe(firstLeft);
  expect(change).toHaveBeenCalledOnce();
});
