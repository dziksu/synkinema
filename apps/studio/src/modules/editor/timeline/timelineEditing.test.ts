import { projectAfter } from "@/api/projectReducer";
import defaults from "@/api/generated/defaults.json";
import type { Asset, Clip, Project, Track } from "@/lib/types";
import { expect, it } from "vitest";
import {
  clipsInRange,
  linkedClipIds,
  linkedClipSet,
  moveSteps,
  planMediaInsert,
  planMove,
  removeSteps,
  withLinked,
} from "./timelineEditing";

const clip = (id: string, start: number, duration = 1000, extra = {}) =>
  ({
    ...structuredClone(defaults.clip),
    id,
    name: id,
    asset_id: "clip-asset",
    start_ms: start,
    duration_ms: duration,
    ...extra,
  }) as unknown as Clip;
const track = (id: string, kind: Track["kind"], clips: Clip[] = []) =>
  ({
    ...structuredClone(defaults.track),
    id,
    name: id,
    kind,
    clips,
  }) as unknown as Track;
const project = (tracks: Track[]) =>
  ({
    ...structuredClone(defaults.project),
    id: "p",
    revision: 3,
    profile: { ...defaults.project.profile, fps: 30 },
    tracks,
  }) as unknown as Project;
const asset = (id: string, extra: Partial<Asset> = {}) =>
  ({
    id,
    name: id,
    kind: "video",
    duration_ms: 3000,
    has_audio: true,
    tags: [],
    ...extra,
  }) as Asset;
const assets = [
  asset("clip-asset"),
  asset("silent", { has_audio: false }),
  asset("song", { kind: "audio" }),
];

it("links synced picture and sound halves and expands selections with them", () => {
  const p = project([
    track("v", "video", [clip("pic", 0), clip("other", 2000)]),
    track("a", "sound", [clip("snd", 0), clip("late", 500)]),
  ]);
  expect(linkedClipIds(p, "pic")).toEqual(["snd"]);
  expect(linkedClipIds(p, "snd")).toEqual(["pic"]);
  expect(linkedClipIds(p, "other")).toEqual([]);
  expect([...linkedClipSet(p)].sort()).toEqual(["pic", "snd"]);
  expect(withLinked(p, ["pic"]).sort()).toEqual(["pic", "snd"]);
  expect(withLinked(p, ["pic"], false)).toEqual(["pic"]);
  expect(withLinked(p, ["missing", "other"])).toEqual(["other"]);
});

it("selects clips intersecting a marquee on the covered tracks only", () => {
  const p = project([
    track("v", "video", [clip("a", 0), clip("b", 1500)]),
    track("o", "overlay", [clip("c", 800)]),
  ]);
  expect(clipsInRange(p, ["v"], 1800, 1100)).toEqual(["b"]);
  expect(clipsInRange(p, ["v", "o"], 900, 1600).sort()).toEqual([
    "a",
    "b",
    "c",
  ]);
});

it("moves a multi-selection by one delta as a single atomic batch", () => {
  const p = project([
    track("v", "video", [clip("a", 0), clip("b", 1000), clip("c", 5000)]),
    track("o", "overlay", [clip("d", 1000, 500, { asset_id: "silent" })]),
  ]);
  const plan = planMove(p, assets, {
    anchor: "a",
    ids: ["a", "b", "d"],
    target: "o",
    delta: 1500,
  });
  expect(plan.valid).toBe(true);
  // Explicit multi-selections never leave their lanes.
  expect(plan.items.map((i) => [i.clip.id, i.to?.id, i.start])).toEqual([
    ["a", "v", 1500],
    ["b", "v", 2500],
    ["d", "o", 2500],
  ]);
  const steps = moveSteps(p, plan);
  expect(steps.every((s) => s.type === "move_clip")).toBe(true);
  const after = projectAfter(p, { steps, batch: true });
  expect(after.tracks[0].clips.map((c) => c.start_ms).sort()).toEqual([
    1500, 2500, 5000,
  ]);
});

it("rejects group moves that collide or cross zero instead of reshuffling", () => {
  const p = project([
    track("v", "video", [clip("a", 500), clip("b", 1500), clip("c", 3000)]),
  ]);
  expect(
    planMove(p, assets, { anchor: "a", ids: ["a", "b"], delta: 1000 }).valid,
  ).toBe(false);
  const clamped = planMove(p, assets, {
    anchor: "b",
    ids: ["a", "b"],
    delta: -2000,
  });
  expect(clamped.delta).toBe(-500);
  expect(clamped.items.map((i) => i.start)).toEqual([1000, 0]);
});

it("keeps linked sound in sync when its picture moves to another lane", () => {
  const p = project([
    track("v", "video", [clip("pic", 0)]),
    track("o", "overlay"),
    track("a", "sound", [clip("snd", 0)]),
  ]);
  const plan = planMove(p, assets, {
    anchor: "pic",
    ids: ["pic", "snd"],
    target: "o",
    delta: 600,
  });
  expect(plan.valid).toBe(true);
  expect(plan.items.map((i) => [i.clip.id, i.to?.id, i.start])).toEqual([
    ["pic", "o", 600],
    ["snd", "a", 600],
  ]);
});

it("suggests a new lane below an occupied track instead of colliding", () => {
  const p = project([
    track("v", "video", [clip("base", 0, 4000, { asset_id: "silent" })]),
    track("o", "overlay", [clip("moving", 6000, 1000, { asset_id: "silent" })]),
    track("a", "sound"),
  ]);
  const plan = planMove(p, assets, {
    anchor: "moving",
    ids: ["moving"],
    target: "v",
    delta: -5000,
    newTrackId: "lane",
  });
  expect(plan.valid).toBe(true);
  // The single primary video track gets an overlay companion.
  expect(plan.newTrack).toEqual({ id: "lane", kind: "overlay", after: "v" });
  const steps = moveSteps(p, plan);
  expect(steps.map((s) => s.type)).toEqual([
    "add_track",
    "reorder_tracks",
    "move_clip",
  ]);
  const after = projectAfter(p, { steps, batch: true });
  expect(after.tracks.map((t) => t.id)).toEqual(["v", "lane", "o", "a"]);
  expect(after.tracks[1].clips[0]).toMatchObject({
    id: "moving",
    start_ms: 1000,
  });
  // Sliding along its own lane settles into the nearest gap.
  const own = planMove(p, assets, {
    anchor: "moving",
    ids: ["moving"],
    delta: -1000,
  });
  expect(own.newTrack).toBeUndefined();
  expect(own.items[0].start).toBe(5000);
});

it("inserts video with its sound on an audio lane so either half can be removed", () => {
  const p = project([track("v", "video"), track("m", "music")]);
  const plan = planMediaInsert(p, assets, {
    asset_id: "clip-asset",
    start_ms: 1000,
    placement: "auto",
    new_track_ids: ["x", "sfx"],
  });
  expect(plan.audio).toEqual({ track_id: "m", created: false });
  const after = projectAfter(p, { steps: plan.steps, batch: true });
  const [picture, sound] = [after.tracks[0].clips[0], after.tracks[1].clips[0]];
  expect(picture).toMatchObject({ start_ms: 1000, duration_ms: 3000 });
  expect(sound).toMatchObject({
    asset_id: "clip-asset",
    start_ms: 1000,
    duration_ms: 3000,
    source_in_ms: 0,
  });
  expect(linkedClipIds(after, picture.id)).toEqual([sound.id]);
  const removed = projectAfter(after, {
    steps: removeSteps(after, [sound.id]),
  });
  expect(removed.tracks[0].clips).toHaveLength(1);
  expect(removed.tracks[1].clips).toHaveLength(0);
});

it("creates missing lanes for picture and sound and honours video-only inserts", () => {
  const p = project([track("v", "video", [clip("busy", 0, 5000)])]);
  const plan = planMediaInsert(p, assets, {
    asset_id: "clip-asset",
    start_ms: 1000,
    placement: "exact",
    track_id: "v",
    new_track_ids: ["pic", "snd"],
  });
  expect(plan.newTrack).toEqual({ id: "pic", kind: "overlay", after: "v" });
  expect(plan.audio).toEqual({ track_id: "snd", created: true });
  const after = projectAfter(p, { steps: plan.steps, batch: true });
  expect(after.tracks.map((t) => [t.id, t.kind])).toEqual([
    ["v", "video"],
    ["pic", "overlay"],
    ["snd", "sound"],
  ]);
  const silent = planMediaInsert(p, assets, {
    asset_id: "clip-asset",
    start_ms: 6000,
    placement: "exact",
    track_id: "v",
    mode: "video",
  });
  expect(silent.audio).toBeUndefined();
  expect(silent.steps.map((s) => s.type)).toEqual(["add_clip"]);
});

it("forces the suggested lane while the pointer is over it", () => {
  const p = project([track("v", "video")]);
  const plan = planMediaInsert(p, assets, {
    asset_id: "silent",
    start_ms: 0,
    placement: "exact",
    track_id: "v",
    new_track: true,
    new_track_ids: ["lane", "x"],
  });
  expect(plan.newTrack).toEqual({ id: "lane", kind: "overlay", after: "v" });
});

it("inserts a ranged audio stream on audio lanes and validates source bounds", () => {
  const p = project([track("v", "video"), track("m", "music")]);
  const plan = planMediaInsert(p, assets, {
    asset_id: "song",
    start_ms: 0,
    placement: "auto",
    source_in_ms: 500,
    duration_ms: 1000,
  });
  expect(plan.track_id).toBe("m");
  expect(plan.steps[0]).toMatchObject({
    type: "add_clip",
    payload: { clip: { source_in_ms: 500, duration_ms: 1000 } },
  });
  expect(() =>
    planMediaInsert(p, assets, {
      asset_id: "song",
      start_ms: 0,
      source_in_ms: 2500,
      duration_ms: 1000,
    }),
  ).toThrow();
  expect(() =>
    planMediaInsert(p, assets, {
      asset_id: "silent",
      start_ms: 0,
      mode: "both",
    }),
  ).toThrow();
});
