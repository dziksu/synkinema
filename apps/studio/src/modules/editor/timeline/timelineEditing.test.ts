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
  planTrim,
  removeSteps,
  splitSteps,
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

it.each(["pic", "snd"])(
  "splits linked picture and sound from %s with matching speed-adjusted source ranges",
  (anchor) => {
    const range = { source_in_ms: 500, speed: 1.5 };
    const p = project([
      track("v", "video", [clip("pic", 1000, 8000, range)]),
      track("a", "sound", [clip("snd", 1000, 8000, range)]),
      track("other", "music", [
        clip("unrelated", 1000, 8000, { asset_id: "song" }),
      ]),
    ]);
    const steps = splitSteps(p, anchor, 5000);
    expect(steps).toHaveLength(2);
    const after = projectAfter(p, { steps, batch: true });
    for (const lane of after.tracks.slice(0, 2)) {
      expect(
        lane.clips.map((c) => [c.start_ms, c.duration_ms, c.source_in_ms]),
      ).toEqual([
        [1000, 4000, 500],
        [5000, 4000, 6500],
      ]);
    }
    expect(after.tracks[2]).toEqual(p.tracks[2]);
    expect(after.revision).toBe(p.revision);
    const [picture, audio] = after.tracks;
    expect(
      new Set(after.tracks.slice(0, 2).flatMap((t) => t.clips.map((c) => c.id)))
        .size,
    ).toBe(4);
    for (let side = 0; side < 2; side++)
      expect(linkedClipIds(after, picture.clips[side].id)).toEqual([
        audio.clips[side].id,
      ]);
  },
);

it("splits only the requested clip when linked selection is disabled", () => {
  const p = project([
    track("v", "video", [clip("pic", 0, 8000)]),
    track("a", "sound", [clip("snd", 0, 8000)]),
  ]);
  const steps = splitSteps(p, "pic", 4000, false);
  expect(steps).toHaveLength(1);
  const after = projectAfter(p, { steps });
  expect(after.tracks[0].clips).toHaveLength(2);
  expect(after.tracks[1]).toEqual(p.tracks[1]);
});

it.each(["pic", "snd"])(
  "trims linked halves from %s while preserving their independent fades and animations",
  (anchor) => {
    const range = { source_in_ms: 500, speed: 1.5 };
    const p = project([
      track("v", "video", [
        clip("pic", 1000, 4000, {
          ...range,
          animations: [
            {
              property: "opacity",
              keyframes: [
                { time_ms: 0, value: 0 },
                { time_ms: 4000, value: 1 },
              ],
            },
          ],
        }),
      ]),
      track("a", "sound", [
        clip("snd", 1000, 4000, {
          ...range,
          fade_in_ms: 500,
          fade_out_ms: 3500,
        }),
      ]),
    ]);
    const media = [asset("clip-asset", { duration_ms: 10000 })];
    const left = planTrim(p, media, anchor, "left", 2000);
    const after = projectAfter(p, {
      steps: left.map((payload) => ({ type: "trim_clip", payload })),
      batch: true,
    });
    expect(left).toHaveLength(2);
    expect(
      after.tracks
        .flatMap((t) => t.clips)
        .map((c) => [c.start_ms, c.duration_ms, c.source_in_ms]),
    ).toEqual([
      [2000, 3000, 2000],
      [2000, 3000, 2000],
    ]);
    expect(linkedClipIds(after, "pic")).toEqual(["snd"]);
    expect(
      after.tracks[0].clips[0].animations[0].keyframes.at(-1)?.time_ms,
    ).toBe(3000);
    expect(after.tracks[1].clips[0]).toMatchObject({
      animations: [],
      fade_in_ms: 500,
      fade_out_ms: 3000,
    });
    expect(
      planTrim(after, media, anchor, "right", 4000).map(
        (p) => p.changes.duration_ms,
      ),
    ).toEqual([2000, 2000]);
  },
);

it("limits linked trims against neighbors on both lanes and the source range", () => {
  const range = { source_in_ms: 3000, speed: 2 };
  const p = project([
    track("v", "video", [clip("pic", 2000, 1000, range)]),
    track("a", "sound", [
      clip("prev", 0, 1500),
      clip("snd", 2000, 1000, range),
      clip("next", 4000),
    ]),
  ]);
  const media = [asset("clip-asset", { duration_ms: 10000 })];
  expect(planTrim(p, media, "pic", "left", 0).map((p) => p.changes)).toEqual([
    expect.objectContaining({
      start_ms: 1500,
      duration_ms: 1500,
      source_in_ms: 2000,
    }),
    expect.objectContaining({
      start_ms: 1500,
      duration_ms: 1500,
      source_in_ms: 2000,
    }),
  ]);
  expect(
    planTrim(p, media, "pic", "right", 6000).map((p) => p.changes.duration_ms),
  ).toEqual([2000, 2000]);
  expect(
    planTrim(
      p,
      [asset("clip-asset", { duration_ms: 6000 })],
      "pic",
      "right",
      6000,
    ).map((p) => p.changes.duration_ms),
  ).toEqual([1500, 1500]);
});

it("trims one half with linking off and honors the visual transition when trimming audio", () => {
  const p = project([
    track("v", "video", [
      clip("pic", 1000, 2000, {
        transition: { type: "fade", duration_ms: 500 },
      }),
    ]),
    track("a", "sound", [clip("snd", 1000, 2000)]),
  ]);
  expect(
    planTrim(p, assets, "snd", "right", 1100).map((p) => p.changes.duration_ms),
  ).toEqual([501, 501]);
  const single = planTrim(p, assets, "snd", "right", 1100, false);
  expect(single).toHaveLength(1);
  expect(single[0]).toMatchObject({
    clip_id: "snd",
    changes: { duration_ms: 100 },
  });
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
    target: "v",
    delta: 1500,
  });
  expect(plan.valid).toBe(true);
  // Horizontal group movement preserves every source lane.
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

it.each([0, 700])(
  "moves adjacent selected captions together to another lane with delta %s",
  (delta) => {
    const p = project([
      track("captions", "text", [clip("a", 0), clip("b", 1000)]),
      track("destination", "text"),
    ]);
    const plan = planMove(p, assets, {
      anchor: "a",
      ids: ["a", "b"],
      target: "destination",
      delta,
    });
    expect(plan.valid).toBe(true);
    expect(
      plan.items.map((item) => [item.clip.id, item.to?.id, item.start]),
    ).toEqual([
      ["a", "destination", delta],
      ["b", "destination", 1000 + delta],
    ]);
    const steps = moveSteps(p, plan);
    expect(steps).toHaveLength(2);
    const after = projectAfter(p, { steps, batch: true });
    expect(after.tracks[0].clips).toHaveLength(0);
    expect(
      after.tracks[1].clips.map((c) => [c.id, c.start_ms, c.duration_ms]),
    ).toEqual([
      ["a", delta, 1000],
      ["b", 1000 + delta, 1000],
    ]);
    expect(p.tracks[0].clips).toHaveLength(2);
  },
);

it("keeps other selected lanes in sync when the anchor lane changes", () => {
  const p = project([
    track("v", "video", [clip("pic-a", 0), clip("pic-b", 1000)]),
    track("o", "overlay"),
    track("a", "sound", [clip("snd-a", 0), clip("snd-b", 1000)]),
    track("titles", "text", [clip("title", 2000)]),
  ]);
  const plan = planMove(p, assets, {
    anchor: "pic-a",
    ids: ["pic-a", "pic-b", "snd-a", "snd-b", "title"],
    target: "o",
    delta: 500,
  });
  expect(plan.valid).toBe(true);
  const after = projectAfter(p, { steps: moveSteps(p, plan), batch: true });
  expect(after.tracks[0].clips).toHaveLength(0);
  expect(after.tracks[1].clips.map((c) => c.start_ms)).toEqual([500, 1500]);
  expect(after.tracks[2].clips.map((c) => c.start_ms)).toEqual([500, 1500]);
  expect(after.tracks[3].clips[0].start_ms).toBe(2500);
  expect(linkedClipIds(after, "pic-a")).toEqual(["snd-a"]);
  expect(linkedClipIds(after, "pic-b")).toEqual(["snd-b"]);
});

it("moves the whole source group to one companion lane when only a later clip collides", () => {
  const p = project([
    track("source", "text", [clip("a", 0), clip("b", 1000)]),
    track("target", "text", [clip("occupied", 1000)]),
  ]);
  const plan = planMove(p, assets, {
    anchor: "a",
    ids: ["a", "b"],
    target: "target",
    delta: 0,
    newTrackId: "companion",
  });
  expect(plan.valid).toBe(true);
  expect(plan.newTrack?.id).toBe("companion");
  expect(plan.items.every((item) => !item.to)).toBe(true);
  const after = projectAfter(p, { steps: moveSteps(p, plan), batch: true });
  expect(after.tracks.find((t) => t.id === "source")?.clips).toHaveLength(0);
  expect(after.tracks.find((t) => t.id === "target")).toEqual(p.tracks[1]);
  expect(
    after.tracks.find((t) => t.id === "companion")?.clips.map((c) => c.id),
  ).toEqual(["a", "b"]);
});

it("rejects incompatible group targets and merging selected clips onto each other", () => {
  const p = project([
    track("source", "text", [clip("a", 0), clip("b", 1000)]),
    track("target", "text", [clip("other", 0)]),
    track("audio", "sound"),
  ]);
  expect(
    planMove(p, assets, {
      anchor: "a",
      ids: ["a", "b"],
      target: "audio",
      delta: 0,
    }).valid,
  ).toBe(false);
  expect(
    planMove(p, assets, {
      anchor: "a",
      ids: ["a", "b", "other"],
      target: "target",
      delta: 500,
    }).valid,
  ).toBe(false);
  const video = project([
    track("v", "video", [clip("a", 0), clip("b", 1000)]),
    track("audio", "sound"),
  ]);
  expect(
    planMove(video, assets, {
      anchor: "a",
      ids: ["a", "b"],
      target: "audio",
      delta: 0,
    }).valid,
  ).toBe(false);
});

it.each(["left", "right"])(
  "preserves an existing dissolve when its complete video pair moves from %s",
  (anchor) => {
    const transition = { type: "crossfade", duration_ms: 700 } as const;
    const p = project([
      track("v", "video", [
        clip("left", 0, 4000),
        clip("right", 3300, 4000, { transition }),
      ]),
      track("o", "overlay"),
    ]);
    const plan = planMove(p, assets, {
      anchor,
      ids: ["left", "right"],
      target: "v",
      delta: 1000,
    });
    expect(plan.valid).toBe(true);
    const steps = moveSteps(p, plan);
    expect(steps.map((s) => s.type)).toEqual([
      "move_clip",
      "move_clip",
      "update_clip",
    ]);
    const after = projectAfter(p, { steps, batch: true });
    expect(after.tracks[0].clips.map((c) => c.start_ms)).toEqual([1000, 4300]);
    expect(after.tracks[0].clips[1].transition).toEqual(transition);
    expect(after.tracks[0].clips[0].transition.type).toBe("cut");
    expect(
      planMove(p, assets, {
        anchor,
        ids: ["left", "right"],
        target: "o",
        delta: 1000,
      }).valid,
    ).toBe(false);
  },
);

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
