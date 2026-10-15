// @vitest-environment jsdom
import defaults from "@/api/generated/defaults.json";
import type { Clip, Track } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { TimelineSelectionTools } from "./TimelineAudioControls";

afterEach(() => {
  cleanup();
  useStudio.getState().set({ selectedId: null });
});

it("offers group duplication when multiple captions are selected", () => {
  useStudio
    .getState()
    .set({ selectedId: "second", selectedIds: ["first", "second"] });
  const onEdit = vi.fn();
  render(
    createElement(TimelineSelectionTools, {
      clip: { ...defaults.clip, id: "second", name: "Second caption" } as Clip,
      track: { ...defaults.track, id: "captions", kind: "text" } as Track,
      onEdit,
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Duplicate selected clips" }),
  );
  expect(onEdit).toHaveBeenCalledWith("duplicate_clips", { clip_id: "second" });
});
