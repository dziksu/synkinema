// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import defaults from "@/api/generated/defaults.json";
import type { Clip, Track } from "@/lib/types";
import ClipInspector from "@/modules/editor/inspector/ClipInspector";
import { captionAnchorX, captionPlacement, moveCaption } from "./CanvasTools";

vi.mock("@/lib/i18n", () => ({ tr: (s: string) => s, useLocale: () => {} }));
afterEach(cleanup);

it("toggles persistent centering without overwriting manual coordinates", () => {
  const clip = { ...defaults.clip, text_x: 0.7, text_align: "right" } as Clip;
  const onChange = vi.fn();
  const props = {
    clip,
    track: { ...defaults.track, kind: "text" } as Track,
    onChange,
    onRemove: vi.fn(),
  };
  const view = render(createElement(ClipInspector, props));
  fireEvent.click(
    screen.getByRole("button", { name: "Auto-center horizontally" }),
  );
  expect(onChange).toHaveBeenLastCalledWith({ text_auto_center: true });
  view.rerender(
    createElement(ClipInspector, {
      ...props,
      clip: { ...clip, text_auto_center: true },
    }),
  );
  expect(screen.queryByText("X position")).toBeNull();
  expect(screen.queryByText("Text alignment")).toBeNull();
  expect(screen.getByText("Y position")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Auto-center horizontally" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Auto-center horizontally" }),
  );
  expect(onChange).toHaveBeenLastCalledWith({ text_auto_center: false });
});

it("keeps centered captions fixed horizontally during movement and resizing", () => {
  const clip = {
    ...defaults.clip,
    text_auto_center: true,
    text_x: 0.7,
    text_y: 0.4,
    font_size: 40,
  } as Clip;
  expect(moveCaption(clip, 0.15, 0.1)).toEqual({ text_y: 0.5 });
  expect(captionAnchorX(clip)).toBe(0.5);
  const bounds = { left: 400, top: 780, width: 280, height: 100 };
  const scaled = captionPlacement(
    bounds,
    clip,
    { ...clip, font_size: 80 },
    { width: 1080, height: 1920 },
  );
  expect(scaled.x).toBe(0.5);
  expect(scaled.width).toBeCloseTo(560 / 1080);
  const manual = moveCaption({ ...clip, text_auto_center: false }, 0.1, 0.1);
  expect(manual.text_x).toBeCloseTo(0.8);
  expect(manual.text_y).toBe(0.5);
});
