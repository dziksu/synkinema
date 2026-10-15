import defaults from "@/api/generated/defaults.json";
import type { EditStep } from "@/api/generated/client";
import { projectAfter } from "@/api/projectReducer";
import type { Project, Track } from "@/lib/types";
import { expect, it } from "vitest";
import { linkedClipIds } from "./timelineEditing";
import { transitionSteps } from "./transitionEditing";

function transitionProject(): Project {
  return {
    ...structuredClone(defaults.project),
    id: "transition",
    revision: 20,
    tracks: (["video", "music", "text"] as const).map((kind) => ({
      ...structuredClone(defaults.track),
      id: kind,
      name: kind,
      kind,
      gain_db: kind === "music" ? -9 : 0,
      ducking: kind === "music",
      muted: kind === "text",
      clips: [0, 1].map((part) => ({
        ...structuredClone(defaults.clip),
        id: `${kind}-${part}`,
        asset_id: kind === "text" ? null : "source",
        text: kind === "text" ? "Caption" : "",
        start_ms: part * 4000,
        source_in_ms: part * 4000,
        duration_ms: 4000,
        transition: { type: "cut", duration_ms: 0 },
      })),
    })),
  } as Project;
}

function transitionEdit(
  duration = 300,
): Extract<EditStep, { type: "set_transition" }> {
  return {
    type: "set_transition",
    payload: {
      track_id: "video",
      clip_id: "video-1",
      transition: {
        type: duration ? "crossfade" : "cut",
        duration_ms: duration,
      },
    },
  };
}

it("preserves linked audio and caption content on companion lanes with their mix settings", () => {
  const original = transitionProject();
  const result = projectAfter(original, {
    steps: transitionSteps(original, transitionEdit()),
  });
  expect(result.tracks).toHaveLength(5);
  expect(linkedClipIds(result, "video-1")).toEqual(["music-1"]);
  for (const kind of ["music", "text"]) {
    const companion = result.tracks.find(
      (track) => track.id !== kind && track.kind === kind,
    )!;
    const previous = original.tracks.find((track) => track.id === kind)!;
    expect(companion).toMatchObject({
      gain_db: previous.gain_db,
      muted: previous.muted,
      ducking: previous.ducking,
      clips: [{ ...previous.clips[1], start_ms: 3700 }],
    });
    expect(result.tracks.find((track) => track.id === kind)?.clips).toEqual([
      previous.clips[0],
    ]);
  }
  expect(original.tracks).toHaveLength(3);
  expect(original.tracks.every((track) => track.clips.length === 2)).toBe(true);
});

it("changes transition duration and removes/readds it without creating redundant lanes", () => {
  let current = transitionProject();
  current = projectAfter(current, {
    steps: transitionSteps(current, transitionEdit()),
  });
  const trackIds = current.tracks.map((track) => track.id);
  for (const duration of [500, 100, 0, 400]) {
    const steps = transitionSteps(current, transitionEdit(duration));
    expect(steps).toHaveLength(1);
    current = projectAfter(current, { steps });
    expect(current.tracks.map((track) => track.id)).toEqual(trackIds);
    expect(linkedClipIds(current, "video-1")).toEqual(["music-1"]);
    expect(current.tracks[0].clips[1].start_ms).toBe(4000 - duration);
  }
});

it("leaves noncolliding ordinary lanes unchanged and rejects lane exhaustion before an edit", () => {
  const project = transitionProject();
  project.tracks[1].clips[0].duration_ms = 3000;
  project.tracks[2].clips[0].duration_ms = 3000;
  expect(transitionSteps(project, transitionEdit())).toHaveLength(1);
  const full = transitionProject();
  while (full.tracks.length < 32)
    full.tracks.push({
      ...defaults.track,
      id: `empty-${full.tracks.length}`,
      clips: [],
    } as Track);
  expect(() => transitionSteps(full, transitionEdit())).toThrow(
    "All 32 tracks",
  );
});
