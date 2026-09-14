// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  CanvasTarget,
  CaptionStyles,
  captionPlacement,
  movePlacement,
  resizePlacement,
} from "./CanvasTools";
import type { Clip, Track } from "./types";
import defaults from "./api/generated/defaults.json";
const clip = {
  id: "c",
  name: "Logo",
  placement: { x: 0.5, y: 0.5, width: 0.4, height: 0.3 },
  text_x: 0.09,
  text_y: 0.66,
  font_size: 80,
} as Clip;
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 1000,
    width: 1000,
    height: 1000,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("snaps to center/edges and preserves opposite corner while resizing", () => {
  expect(movePlacement(clip.placement!, 0.008, 0.1)).toMatchObject({
    x: 0.5,
    y: 0.6,
  });
  expect(movePlacement(clip.placement!, 0.008, 0.1, false).x).toBeCloseTo(
    0.508,
  );
  const resized = resizePlacement(clip.placement!, 0.2, 0.15, "se", true);
  expect(resized.width / resized.height).toBeCloseTo(4 / 3);
  expect(resized.x - resized.width / 2).toBeCloseTo(0.3);
  expect(resized.y - resized.height / 2).toBeCloseTo(0.35);
});
it("canvas movement updates a draft but commits once on release; Escape cancels", () => {
  const commit = vi.fn(),
    draft = vi.fn();
  render(
    <div className="preview-canvas">
      <CanvasTarget
        clip={clip}
        track={{ kind: "overlay" } as Track}
        selected
        frameWidth={1080}
        onSelect={() => {}}
        onDraft={draft}
        onCommit={commit}
      />
    </div>,
  );
  const target = screen.getByRole("button");
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { clientX: 200, clientY: 250 });
  expect(commit).not.toHaveBeenCalled();
  expect(draft).toHaveBeenLastCalledWith({
    placement: { x: 0.6, y: 0.65, width: 0.4, height: 0.3 },
  });
  fireEvent.pointerUp(target);
  expect(commit).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { clientX: 400, clientY: 300 });
  fireEvent.keyDown(target, { key: "Escape" });
  fireEvent.pointerUp(target);
  expect(commit).toHaveBeenCalledTimes(1);
});
it("caption dragging uses the starting position even after draft rerenders", () => {
  const commit = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState<Partial<Clip> | null>(null);
    return (
      <div className="preview-canvas">
        <CanvasTarget
          clip={{ ...clip, ...draft }}
          track={{ kind: "text" } as Track}
          textPlacement={{ x: 0.4, y: 0.7, width: 0.5, height: 0.1 }}
          selected
          frameWidth={1080}
          onSelect={() => {}}
          onDraft={setDraft}
          onCommit={commit}
        />
      </div>
    );
  }
  render(<Harness />);
  const target = screen.getByRole("button");
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { clientX: 150, clientY: 150 });
  fireEvent.pointerMove(target, { clientX: 200, clientY: 200 });
  fireEvent.pointerUp(target);
  expect(commit.mock.calls[0][0].text_x).toBeCloseTo(0.19);
  expect(commit.mock.calls[0][0].text_y).toBeCloseTo(0.76);
});
it("exposes four accessible caption styles", () => {
  const change = vi.fn();
  render(<CaptionStyles value="editorial" onChange={change} />);
  expect(screen.getAllByRole("button")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: /Bold hook/ }));
  expect(change).toHaveBeenCalledWith("bold");
});

it("positions the text hit area from measured glyph bounds and transforms it with the draft", () => {
  const bounds = { left: 97, top: 1300, width: 480, height: 220 };
  const profile = defaults.profile;
  const placement = captionPlacement(bounds, clip, clip, profile);
  expect(placement.width).toBeCloseTo(480 / profile.width);
  expect(placement.height).toBeCloseTo(220 / profile.height);
  expect(placement.y - placement.height / 2).toBeCloseTo(1300 / profile.height);
  const changed = {
    ...clip,
    text_x: clip.text_x + 0.1,
    text_y: clip.text_y - 0.1,
    font_size: 160,
  };
  const moved = captionPlacement(bounds, clip, changed, profile);
  expect(moved.width).toBeCloseTo(placement.width * 2);
  expect(moved.height).toBeCloseTo(placement.height * 2);
  expect(moved.x).toBeCloseTo(changed.text_x + (placement.x - clip.text_x) * 2);
  expect(moved.y).toBeCloseTo(changed.text_y + (placement.y - clip.text_y) * 2);
  const view = render(
    <CanvasTarget
      clip={clip}
      track={{ kind: "text" } as Track}
      selected
      frameWidth={1080}
      textPlacement={placement}
      onSelect={vi.fn()}
      onDraft={vi.fn()}
      onCommit={vi.fn()}
    />,
  );
  expect(screen.getByRole("button").style.height).toBe(
    `${placement.height * 100}%`,
  );
  view.rerender(
    <CanvasTarget
      clip={changed}
      track={{ kind: "text" } as Track}
      selected
      frameWidth={1080}
      textPlacement={moved}
      onSelect={vi.fn()}
      onDraft={vi.fn()}
      onCommit={vi.fn()}
    />,
  );
  expect(screen.getByRole("button").style.height).toBe(
    `${moved.height * 100}%`,
  );
});

it.each([
  ["nw", -100, 0],
  ["ne", 0, -50],
  ["sw", 0, 50],
  ["se", 100, 0],
])(
  "resizes text outward from the %s corner in either direction",
  (corner, dx, dy) => {
    const commit = vi.fn();
    const { container } = render(
      <div className="preview-canvas">
        <CanvasTarget
          clip={clip}
          track={{ kind: "text" } as Track}
          selected
          frameWidth={1080}
          textPlacement={{ x: 0.5, y: 0.5, width: 0.4, height: 0.2 }}
          onSelect={vi.fn()}
          onDraft={vi.fn()}
          onCommit={commit}
        />
      </div>,
    );
    const target = screen.getByRole("button");
    fireEvent.pointerDown(
      container.querySelector(`[data-corner="${corner}"]`)!,
      { button: 0, clientX: 200, clientY: 200 },
    );
    fireEvent.pointerMove(target, {
      clientX: 200 + Number(dx),
      clientY: 200 + Number(dy),
    });
    fireEvent.pointerUp(target);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ font_size: 100 });
  },
);

it("reserves media and preview space on small desktop screens", async () => {
  const { clampTimelineHeight } = await import("./timelineMath");
  expect(clampTimelineHeight(720)).toBe(340);
  expect(clampTimelineHeight(900)).toBe(340);
  expect(clampTimelineHeight(720, 500)).toBe(360);
});

it("preserves keyboard focus while a new caption raster loads without showing stale geometry", () => {
  const commit = vi.fn();
  const draw = (ready: boolean) => (
    <CanvasTarget
      clip={clip}
      track={{ kind: "text" } as Track}
      selected
      frameWidth={1080}
      textPlacement={
        ready ? { x: 0.5, y: 0.5, width: 0.4, height: 0.2 } : undefined
      }
      onSelect={vi.fn()}
      onDraft={vi.fn()}
      onCommit={commit}
    />
  );
  const view = render(draw(true));
  const target = screen.getByRole("button");
  target.focus();
  view.rerender(draw(false));
  expect(screen.getByRole("button")).toBe(target);
  expect(document.activeElement).toBe(target);
  expect(target.style.opacity).toBe("0");
  expect(target.style.pointerEvents).toBe("none");
  fireEvent.keyDown(target, { key: "ArrowRight" });
  expect(commit.mock.calls[0][0].text_x).toBeCloseTo(clip.text_x + 1 / 1080);
  view.rerender(draw(true));
  expect(document.activeElement).toBe(target);
  expect(target.style.opacity).toBe("");
});
