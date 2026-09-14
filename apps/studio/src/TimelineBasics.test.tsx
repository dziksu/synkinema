// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Timeline from "./Timeline";
import { TrackGain, AudioEnvelope } from "./TimelineAudioControls";
import { audioLevel, gainAnimation, putGainPoint } from "./timelineAudio";
import { deleteTimelineTrack } from "./timelineActions";
import { projectAfter } from "./api/projectReducer";
import { useStudio } from "./store";
import defaults from "./api/generated/defaults.json";
import type { Clip, Project, Track } from "./types";

const clip = {
  ...defaults.clip,
  id: "tone",
  asset_id: "a",
  name: "Tone",
  start_ms: 1000,
  duration_ms: 4000,
} as Clip;
const track = {
  ...defaults.track,
  id: "music",
  kind: "music",
  name: "Music",
  clips: [clip],
} as Track;
const project = {
  ...defaults.project,
  id: "p",
  duration_ms: 5000,
  tracks: [track],
} as Project;
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  SVGElement.prototype.setPointerCapture = vi.fn();
  useStudio.setState({
    page: "studio",
    projectId: "p",
    selectedId: null,
    time: 2000,
    audioDraft: null,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useStudio.setState({ audioDraft: null });
});

it("exposes deletion for populated default tracks and applies one undoable atomic plan", async () => {
  const edit = vi.fn();
  render(
    <Timeline
      project={project}
      assets={[]}
      zoom={1}
      reviews={[]}
      onEdit={edit}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Track settings for Music" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove track" }));
  expect(edit).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove track and clips" }),
  );
  expect(edit).toHaveBeenCalledWith("delete_timeline_track", {
    track_id: "music",
    clip_ids: ["tone"],
  });
  const plan = {
    steps: deleteTimelineTrack(project, "music", ["tone"]),
    batch: true,
  };
  expect(projectAfter(project, plan).tracks).toEqual([]);
  expect(() => deleteTimelineTrack(project, "music", [])).toThrow(
    "track changed",
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("offers split and duplicate beside the selected clip with absolute playhead time", () => {
  useStudio.setState({ selectedId: "tone" });
  const edit = vi.fn();
  render(
    <Timeline
      project={project}
      assets={[]}
      zoom={1}
      reviews={[]}
      onEdit={edit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Split at playhead" }));
  expect(edit).toHaveBeenCalledWith("split_clip", {
    track_id: "music",
    clip_id: "tone",
    time_ms: 2000,
  });
  fireEvent.click(screen.getByRole("button", { name: "Duplicate clip" }));
  expect(edit).toHaveBeenCalledWith("duplicate_clip", {
    track_id: "music",
    clip_id: "tone",
  });
});

it("previews slider movement, saves once on release and removes failed drafts", async () => {
  let fail!: (reason: Error) => void;
  const edit = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      }),
  );
  render(<TrackGain track={track} onEdit={edit} />);
  const slider = screen.getByRole("slider", { name: "Volume for Music" });
  fireEvent.change(slider, { target: { value: "-12" } });
  expect(edit).not.toHaveBeenCalled();
  expect(useStudio.getState().audioDraft).toEqual({
    trackId: "music",
    gain_db: -12,
  });
  fireEvent.pointerUp(slider);
  fireEvent.blur(slider);
  expect(edit).toHaveBeenCalledExactlyOnceWith("update_track", {
    track_id: "music",
    changes: { gain_db: -12 },
  });
  fail(new Error("conflict"));
  await waitFor(() => expect(useStudio.getState().audioDraft).toBeNull());
  expect((slider as HTMLInputElement).value).toBe("0");
});

it("adds, adjusts and removes volume points without moving the clip", () => {
  const edit = vi.fn();
  const { container, rerender } = render(
    <AudioEnvelope
      clip={clip}
      track={track}
      width={240}
      left={60}
      onEdit={edit}
    />,
  );
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 240,
    height: 40,
  } as DOMRect);
  fireEvent.pointerDown(container.querySelector(".envelope-hit")!, {
    button: 0,
    altKey: true,
    clientX: 120,
    clientY: 20,
  });
  const changes = edit.mock.calls[0][1].changes;
  expect(changes.animations[0].keyframes).toEqual([
    { time_ms: 2000, value: -24, easing: "linear" },
  ]);
  const animated = { ...clip, ...changes };
  rerender(
    <AudioEnvelope
      clip={animated}
      track={track}
      width={240}
      left={60}
      onEdit={edit}
    />,
  );
  fireEvent.keyDown(screen.getByRole("slider", { name: "Volume point 1" }), {
    key: "ArrowUp",
  });
  expect(
    edit.mock.calls.at(-1)![1].changes.animations[0].keyframes[0].value,
  ).toBe(-23);
  fireEvent.contextMenu(screen.getByRole("slider", { name: "Volume point 1" }));
  expect(edit.mock.calls.at(-1)![1].changes.animations).toEqual([]);
  expect(edit.mock.calls.every(([type]) => type === "update_clip")).toBe(true);
});

it("combines track gain, interpolated clip gain and fades at clip-local time", () => {
  const animated = {
    ...clip,
    fade_in_ms: 1000,
    fade_out_ms: 1000,
    animations: gainAnimation(clip, [
      { time_ms: 0, value: 0, easing: "linear" },
      { time_ms: 4000, value: -12, easing: "linear" },
    ]),
  };
  expect(audioLevel(animated, 3000, -6)).toBeCloseTo(10 ** (-12 / 20));
  expect(audioLevel(animated, 1500, -6)).toBeCloseTo(0.5 * 10 ** (-7.5 / 20));
  expect(audioLevel(animated, 4500, -6)).toBeCloseTo(0.5 * 10 ** (-16.5 / 20));
  expect(audioLevel(animated, 999)).toBe(0);
  expect(audioLevel(animated, 5000)).toBe(0);
  expect(putGainPoint(animated, 4000, -9)[0].keyframes).toHaveLength(2);
});
