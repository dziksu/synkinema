import { expect, it } from "vitest";
import { sourceInsert, type SourceInsert } from "./sourceInsert";
import type { Asset, Project } from "./types";
const asset = {
  id: "film",
  name: "Trailer",
  kind: "video",
  duration_ms: 10000,
  has_audio: true,
} as Asset;
const project = {
  tracks: [
    {
      id: "v",
      kind: "video",
      clips: [{ id: "old", start_ms: 1000, duration_ms: 4000 }],
    },
    { id: "a", kind: "music", clips: [] },
  ],
} as unknown as Project;
const intent: SourceInsert = {
  asset_id: "film",
  source_in_ms: 2000,
  duration_ms: 1500,
  mode: "both",
  track_id: "v",
  audio_track_id: "a",
  start_ms: 0,
};
it("adds a selected source range with aligned audio after occupied video, without overwriting", () => {
  const result = sourceInsert(project, [asset], intent);
  expect(result.start_ms).toBe(5000);
  expect(result.operations).toHaveLength(2);
  for (const op of result.operations)
    expect(op.payload.clip).toMatchObject({
      source_in_ms: 2000,
      duration_ms: 1500,
      start_ms: 5000,
    });
  expect(project.tracks[0].clips).toHaveLength(1);
});
it("uses the latest track end and can create a dedicated audio track atomically", () => {
  const result = sourceInsert(project, [asset], {
    ...intent,
    append: true,
    audio_track_id: "new",
  });
  expect(result.start_ms).toBe(5000);
  expect(result.operations.map((o) => o.type)).toEqual([
    "add_clip",
    "add_track",
    "add_clip",
  ]);
  expect(result.operations[2].payload.track_id).toBe(
    result.operations[1].payload.id,
  );
});
it("adds audio alone on its requested track at the cursor", () => {
  const result = sourceInsert(project, [asset], {
    ...intent,
    track_id: "a",
    mode: "audio",
    start_ms: 2500,
  });
  expect(result.operations).toHaveLength(1);
  expect(result.start_ms).toBe(2500);
  expect(result.operations[0].payload.track_id).toBe("a");
});
it("finds a common free interval when an audio collision pushes the pair into another video", () => {
  const p = structuredClone(project);
  p.tracks[0].clips.push({
    ...p.tracks[0].clips[0],
    id: "later",
    start_ms: 6500,
    duration_ms: 2000,
  });
  p.tracks[1].clips.push({
    ...p.tracks[0].clips[0],
    id: "sound",
    start_ms: 5000,
    duration_ms: 1500,
  });
  const result = sourceInsert(p, [asset], intent);
  expect(result.start_ms).toBe(8500);
  for (const op of result.operations)
    expect(op.payload.clip).toMatchObject({ start_ms: 8500 });
});
it("rejects invalid source ranges, incompatible tracks, and missing audio", () => {
  for (const changes of [
    { source_in_ms: -1 },
    { source_in_ms: 9500 },
    { duration_ms: 99 },
    { duration_ms: NaN },
    { duration_ms: 100.5 },
    { start_ms: -1 },
    { mode: "audio" as const },
    { audio_track_id: "missing" },
  ]) {
    expect(() =>
      sourceInsert(project, [asset], { ...intent, ...changes }),
    ).toThrow();
  }
  expect(() =>
    sourceInsert(project, [{ ...asset, has_audio: false }], intent),
  ).toThrow("has no audio");
});
