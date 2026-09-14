// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fitPreview, usePreviewSize } from "./usePreviewSize";

let callbacks: ResizeObserverCallback[];
let stageWidth: number;
let stageHeight: number;
const disconnect = vi.fn();
beforeEach(() => {
  callbacks = [];
  stageWidth = 600;
  stageHeight = 400;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: stageWidth, height: stageHeight }) as DOMRect,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});

function Harness({ width = 1080, height = 1920, zoom = 1 }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = usePreviewSize(ref, width, height, zoom);
  return (
    <div ref={ref} style={{ padding: 32, border: 0 }}>
      <output>{JSON.stringify(size)}</output>
    </div>
  );
}
const result = () => JSON.parse(screen.getByRole("status").textContent!);
const resize = (width: number, height: number, callback = callbacks.at(-1)!) =>
  act(() =>
    callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      {} as ResizeObserver,
    ),
  );

it("fits portrait, landscape and square profiles without enlarging the available workspace", () => {
  expect(fitPreview(600, 400, 1080, 1920)).toEqual({ width: 225, height: 400 });
  expect(fitPreview(600, 400, 1920, 1080)).toEqual({
    width: 600,
    height: 337.5,
  });
  expect(fitPreview(600, 400, 1080, 1080)).toEqual({ width: 400, height: 400 });
  expect(fitPreview(600, 400, 1080, 1920, 0.5)).toEqual({
    width: 112.5,
    height: 200,
  });
  expect(fitPreview(0, 0, 1080, 1920)).toEqual({ width: 0, height: 0 });
  expect(fitPreview(-10, 100, 1080, 1920)).toEqual({ width: 0, height: 0 });
});

it("measures before paint, follows repeated expand/shrink events and recovers after a hidden panel", () => {
  render(<Harness />);
  expect(result()).toEqual({ width: 189, height: 336 });
  for (const [width, height] of [
    [1100, 800],
    [450, 230],
    [980, 620],
    [420, 210],
    [0, 0],
    [600, 400],
  ]) {
    resize(width, height);
    expect(result()).toEqual(fitPreview(width, height, 1080, 1920));
  }
});

it("refits on native fullscreen/window resize, zoom and profile changes; old observers cannot restore stale sizes", () => {
  const view = render(<Harness />);
  stageWidth = 1000;
  stageHeight = 800;
  act(() => document.dispatchEvent(new Event("fullscreenchange")));
  expect(result()).toEqual(fitPreview(936, 736, 1080, 1920));
  stageWidth = 500;
  stageHeight = 300;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(result()).toEqual(fitPreview(436, 236, 1080, 1920));
  const old = callbacks[0];
  view.rerender(<Harness width={1920} height={1080} zoom={0.5} />);
  expect(result()).toEqual(fitPreview(436, 236, 1920, 1080, 0.5));
  resize(2000, 2000, old);
  expect(result()).toEqual(fitPreview(436, 236, 1920, 1080, 0.5));
  view.unmount();
  expect(disconnect).toHaveBeenCalledTimes(2);
});
