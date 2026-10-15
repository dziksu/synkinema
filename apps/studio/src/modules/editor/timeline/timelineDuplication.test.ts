import defaults from "@/api/generated/defaults.json";
import type { Clip, Project, Track } from "@/lib/types";
import { projectAfter } from "@/api/projectReducer";
import { expect, it } from "vitest";
import { duplicateSteps } from "./timelineDuplication";

const clip = (id: string, start_ms: number, duration_ms = 1000) =>
  ({
    ...structuredClone(defaults.clip),
    id,
    name: id,
    start_ms,
    duration_ms,
  }) as Clip;
const track = (id: string, clips: Clip[], kind: Track["kind"] = "text") =>
  ({ ...structuredClone(defaults.track), id, kind, clips }) as Track;
const project = (tracks: Track[]) =>
  ({ ...structuredClone(defaults.project), tracks }) as Project;

it("copies both selected captions, preserving gaps, duration, content and originals", () => {
  const first = { ...clip("first", 0), text: "First caption" };
  const second = { ...clip("second", 2000, 500), text: "Second caption" };
  const p = project([track("captions", [first, second])]);
  const steps = duplicateSteps(p, ["second", "first"], false);
  const result = projectAfter(p, { steps });
  expect(result.tracks[0].clips.map((c) => c.start_ms)).toEqual([
    0, 2000, 2500, 4500,
  ]);
  expect(result.tracks[0].clips.slice(0, 2)).toEqual([first, second]);
  expect(
    result.tracks[0].clips.slice(2).map((c) => [c.text, c.duration_ms]),
  ).toEqual([
    ["First caption", 1000],
    ["Second caption", 500],
  ]);
  expect(new Set(result.tracks[0].clips.map((c) => c.id)).size).toBe(4);
});

it("finds one free offset for all lanes without moving neighbors or losing relative timing", () => {
  const p = project([
    track("one", [clip("a", 0), clip("block-a", 5000, 2000)]),
    track("two", [clip("b", 1000), clip("block-b", 3000, 3000)]),
  ]);
  const result = projectAfter(p, {
    steps: duplicateSteps(p, ["a", "b"], false),
  });
  expect(result.tracks.map((t) => t.clips.at(-1)?.start_ms)).toEqual([
    7000, 8000,
  ]);
  expect(result.tracks.map((t) => t.clips.slice(0, 2))).toEqual(
    p.tracks.map((t) => t.clips),
  );
});

it("duplicates linked picture and sound once, and respects unlinked mode", () => {
  const p = project([
    track("v", [{ ...clip("picture", 0), asset_id: "source" }], "video"),
    track("a", [{ ...clip("sound", 0), asset_id: "source" }], "sound"),
  ]);
  expect(duplicateSteps(p, ["picture"])).toHaveLength(2);
  expect(duplicateSteps(p, ["picture", "sound"])).toHaveLength(2);
  expect(duplicateSteps(p, ["picture"], false)).toHaveLength(1);
  expect(() => duplicateSteps(p, ["picture", "deleted"])).toThrow(
    "no longer available",
  );
});

it("preserves internal transitions but detaches a transition from an unselected predecessor", () => {
  const transition = { type: "crossfade" as const, duration_ms: 300 };
  const p = project([
    track(
      "v",
      [clip("a", 0, 4000), { ...clip("b", 3700, 4000), transition }],
      "video",
    ),
  ]);
  const result = projectAfter(p, { steps: duplicateSteps(p, ["a", "b"]) });
  expect(result.tracks[0].clips.slice(2).map((c) => c.start_ms)).toEqual([
    7700, 11400,
  ]);
  expect(result.tracks[0].clips.at(-1)?.transition).toEqual(transition);
  const single = projectAfter(p, { steps: duplicateSteps(p, ["b"]) });
  expect(single.tracks[0].clips.at(-1)?.transition).toEqual({
    type: "cut",
    duration_ms: 0,
  });
});
