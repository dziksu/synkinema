// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePlaybackShortcut } from "./usePlaybackShortcut";
import { TrackGain } from "./TimelineAudioControls";
import { useStudio } from "./store";
import defaults from "./api/generated/defaults.json";
import type { Track } from "./types";

function Harness({ enabled = true }: { enabled?: boolean }) {
  usePlaybackShortcut(enabled);
  return (
    <>
      <TrackGain
        track={
          {
            ...defaults.track,
            id: "music",
            name: "Music",
            kind: "music",
          } as Track
        }
        onEdit={vi.fn()}
      />
      <button onKeyDown={(e) => e.stopPropagation()}>Delete clip</button>
      <input aria-label="Gain" type="number" />
      <input aria-label="Name" />
      <textarea aria-label="Caption" />
      <div role="dialog">
        <button>Confirm deletion</button>
      </div>
    </>
  );
}
const space = { code: "Space", key: " " };
beforeEach(() => useStudio.setState({ playing: false, audioDraft: null }));
afterEach(cleanup);

it("captures Space after dragging a track fader, blocks scrolling and toggles exactly once per press", () => {
  render(<Harness />);
  const slider = screen.getByRole("slider");
  slider.focus();
  fireEvent.change(slider, { target: { value: "-12" } });
  fireEvent.pointerUp(slider);
  expect(fireEvent.keyDown(slider, space)).toBe(false);
  expect(useStudio.getState().playing).toBe(true);
  fireEvent.keyDown(slider, { ...space, repeat: true });
  expect(useStudio.getState().playing).toBe(true);
  expect(fireEvent.keyUp(slider, space)).toBe(false);
  fireEvent.keyDown(slider, space);
  expect(useStudio.getState().playing).toBe(false);
});

it("takes priority over focused buttons and numeric controls without triggering their key handlers", () => {
  render(<Harness />);
  for (const control of [
    screen.getByRole("button", { name: "Delete clip" }),
    screen.getByLabelText("Gain"),
  ]) {
    const local = vi.fn();
    control.addEventListener("keydown", local);
    control.addEventListener("keyup", local);
    control.focus();
    expect(fireEvent.keyDown(control, space)).toBe(false);
    expect(useStudio.getState().playing).toBe(true);
    expect(fireEvent.keyUp(control, space)).toBe(false);
    expect(local).not.toHaveBeenCalled();
    useStudio.setState({ playing: false });
  }
});

it("preserves text entry, modal keyboard actions and modified shortcuts", () => {
  render(<Harness />);
  for (const target of [
    screen.getByLabelText("Name"),
    screen.getByLabelText("Caption"),
    screen.getByRole("button", { name: "Confirm deletion" }),
  ]) {
    expect(fireEvent.keyDown(target, space)).toBe(true);
    expect(fireEvent.keyUp(target, space)).toBe(true);
    expect(useStudio.getState().playing).toBe(false);
  }
  expect(fireEvent.keyDown(document.body, { ...space, ctrlKey: true })).toBe(
    true,
  );
  expect(
    fireEvent.keyDown(document.body, { ...space, isComposing: true }),
  ).toBe(true);
  expect(useStudio.getState().playing).toBe(false);
});

it("does not intercept outside the editor and removes capture listeners on unmount", () => {
  const view = render(<Harness enabled={false} />);
  expect(fireEvent.keyDown(document.body, space)).toBe(true);
  view.rerender(<Harness />);
  expect(fireEvent.keyDown(document.body, space)).toBe(false);
  fireEvent.keyUp(document.body, space);
  view.unmount();
  expect(fireEvent.keyDown(document.body, space)).toBe(true);
  expect(useStudio.getState().playing).toBe(true);
});
