// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStudio } from "@/modules/editor/store";
import TimelineRuler from "./TimelineRuler";

beforeEach(() => {
  useStudio.getState().set({ time: 0, playing: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function view(durationMs = 8000) {
  render(
    createElement(TimelineRuler, {
      durationMs,
      fps: 25,
      zoom: 1,
      width: 1200,
      rulerDurationMs: 20000,
    }),
  );
  return screen.getByRole("slider", { name: "Timeline playhead" });
}

it("exposes the actual playhead position and updates it during playback", () => {
  const slider = view();
  expect(slider.getAttribute("aria-valuenow")).toBe("0");
  expect(slider.getAttribute("aria-valuemax")).toBe("7999");
  act(() => useStudio.getState().set({ time: 2500, playing: true }));
  expect(slider.getAttribute("aria-valuenow")).toBe("2500");
  expect(slider.getAttribute("aria-valuetext")).toBe("2.500 s");
});

it("seeks by one frame with arrow keys, pauses, and clamps at both ends", () => {
  const slider = view();
  act(() => useStudio.getState().set({ playing: true }));
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(useStudio.getState().time).toBe(40);
  expect(useStudio.getState().playing).toBe(false);
  expect(slider.getAttribute("aria-valuenow")).toBe("40");
  fireEvent.keyDown(slider, { key: "ArrowUp" });
  expect(useStudio.getState().time).toBe(80);
  fireEvent.keyDown(slider, { key: "ArrowDown" });
  expect(useStudio.getState().time).toBe(40);
  fireEvent.keyDown(slider, { key: "Home" });
  fireEvent.keyDown(slider, { key: "ArrowLeft" });
  expect(useStudio.getState().time).toBe(0);
  fireEvent.keyDown(slider, { key: "End" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(useStudio.getState().time).toBe(7999);
  expect(slider.getAttribute("aria-valuenow")).toBe("7999");
});

it("keeps an empty timeline at zero for all navigation keys", () => {
  const slider = view(0);
  for (const key of ["End", "ArrowRight", "ArrowLeft", "Home"]) {
    fireEvent.keyDown(slider, { key });
    expect(useStudio.getState().time).toBe(0);
  }
  expect(slider.getAttribute("aria-valuemax")).toBe("0");
  expect(slider.getAttribute("aria-valuenow")).toBe("0");
});

it("focuses the ruler after a pointer seek so subsequent arrows move the playhead", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  const slider = view();
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 0, 1200, 28),
  );
  fireEvent.pointerDown(slider, { clientX: 160, pointerId: 1 });
  expect(document.activeElement).toBe(slider);
  expect(useStudio.getState().time).toBe(1000);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(useStudio.getState().time).toBe(1040);
});
