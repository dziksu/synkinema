// @vitest-environment jsdom
import { TooltipProvider } from "@/components/ui/tooltip";
import defaults from "@/api/generated/defaults.json";
import type { Clip, Track } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import TimelineSplitButton from "./TimelineSplitButton";

afterEach(cleanup);
const clip = {
  ...defaults.clip,
  id: "clip",
  start_ms: 1000,
  duration_ms: 2000,
} as unknown as Clip;
const track = { ...defaults.track, id: "track" } as unknown as Track;

it.each([true, false])(
  "keeps split control compact=%s disabled outside a valid cut and updates while seeking",
  (compact) => {
    useStudio.getState().set({ time: 0 });
    const onEdit = vi.fn();
    render(
      createElement(TimelineSplitButton, { clip, track, compact, onEdit }),
      { wrapper: TooltipProvider },
    );
    const button = screen.getByRole("button") as HTMLButtonElement;
    for (const time of [0, 1000, 1099, 2901, 3000, 4000]) {
      act(() => useStudio.getState().set({ time }));
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(onEdit).not.toHaveBeenCalled();
    }
    for (const time of [1100, 2000, 2900]) {
      act(() => useStudio.getState().set({ time }));
      expect(button.disabled).toBe(false);
    }
    fireEvent.click(button);
    expect(onEdit).toHaveBeenCalledWith("split_clip", {
      track_id: "track",
      clip_id: "clip",
      time_ms: 2900,
    });
  },
);

it("disables the toolbar split while saving or without a selected clip", () => {
  useStudio.getState().set({ time: 2000 });
  const onEdit = vi.fn();
  const ui = render(
    createElement(TimelineSplitButton, {
      clip,
      track,
      onEdit,
      compact: true,
      pending: true,
    }),
    { wrapper: TooltipProvider },
  );
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  ui.rerender(createElement(TimelineSplitButton, { onEdit, compact: true }));
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
});
