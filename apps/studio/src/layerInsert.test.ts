import { expect, it } from "vitest";
import {
  canvasDrop,
  canvasInsert,
  elementMime,
  layerInsert,
} from "./layerInsert";
import { projectAfter } from "./api/projectReducer";
import defaults from "./api/generated/defaults.json";
import type { Asset, Project } from "./types";
const project = () => structuredClone(defaults.project) as Project;
const film = {
  id: "film",
  name: "Film",
  kind: "video",
  duration_ms: 10000,
  has_audio: true,
  tags: [],
} as unknown as Asset;
const add = (p: Project, start_ms = 1000) =>
  canvasInsert(p, [], { shape: "rectangle", start_ms });
it("creates independent simultaneous layers and reuses the entire free interval at frame precision", () => {
  let p = project();
  p.profile.fps = 30;
  const first = add(p, 1011);
  p = projectAfter(p, first);
  expect(first.start_ms).toBe(1000);
  const second = add(p, 1000);
  p = projectAfter(p, second);
  expect(second.track_id).not.toBe(first.track_id);
  expect(
    p.tracks.filter((t) => t.kind === "overlay").map((t) => t.name),
  ).toEqual(["Elements", "Elements 2"]);
  const next = add(p, 5000);
  expect(next.track_id).toBe(first.track_id);
  expect(next.steps).toHaveLength(1);
  expect(next.start_ms).toBe(5000);
  // Playhead is empty but the proposed clip would hit a future clip.
  const before = add(p, 0);
  expect(before.track_id).not.toBe(first.track_id);
});
it("skips muted or full tracks and refuses a 33rd track without modifying the project", () => {
  let p = projectAfter(project(), add(project()));
  p.tracks.at(-1)!.muted = true;
  expect(add(p, 5000).steps).toHaveLength(2);
  p.tracks = Array.from({ length: 32 }, (_, i) => ({
    ...p.tracks.at(-1)!,
    id: `lane${i}`,
  }));
  expect(() => add(p)).toThrow("32 tracks");
  expect(p.tracks).toHaveLength(32);
});
it("routes full media and tagged sound without truncation or shifting from the playhead", () => {
  let p = project();
  const visual = canvasInsert(p, [film], {
    asset_id: film.id,
    start_ms: 2033,
    center: { x: 0.2, y: 0.7 },
  });
  p = projectAfter(p, visual);
  expect(p.tracks.at(-1)!.clips[0]).toMatchObject({
    start_ms: 2033,
    duration_ms: 10000,
    placement: { x: 0.2, y: 0.7 },
  });
  const sound = {
    ...film,
    id: "sfx",
    kind: "audio",
    duration_ms: 600,
    tags: ["sfx"],
  } as Asset;
  const first = canvasInsert(p, [sound], {
    asset_id: sound.id,
    start_ms: 2033,
  });
  p = projectAfter(p, first);
  expect(p.tracks.at(-1)).toMatchObject({
    kind: "sound",
    clips: [{ duration_ms: 600, gain_db: -12, start_ms: 2033 }],
  });
  const second = canvasInsert(p, [sound], {
    asset_id: sound.id,
    start_ms: 2033,
  });
  expect(second.track_id).not.toBe(first.track_id);
  expect(second.start_ms).toBe(2033);
});
it("preserves source trim and synchronized video/audio on separate free layers", () => {
  let p = project();
  const voice = p.tracks.find((t) => t.kind === "voiceover")!;
  voice.clips = [
    {
      ...defaults.clip,
      id: "busy",
      asset_id: "film",
      start_ms: 0,
      duration_ms: 9000,
    },
  ] as typeof voice.clips;
  const result = canvasInsert(p, [film], {
    asset_id: "film",
    start_ms: 2000,
    source: {
      asset_id: "film",
      source_in_ms: 4000,
      duration_ms: 1500,
      mode: "both",
      audio_track_id: voice.id,
    },
  });
  p = projectAfter(p, result);
  const added = p.tracks.flatMap((t) => t.clips).filter((c) => c.id !== "busy");
  expect(added).toHaveLength(2);
  for (const clip of added)
    expect(clip).toMatchObject({
      start_ms: 2000,
      duration_ms: 1500,
      source_in_ms: 4000,
    });
  expect(p.tracks.at(-1)).toMatchObject({
    kind: "voiceover",
    name: "Voiceover 2",
  });
  expect(voice.clips).toHaveLength(1);
});
it("rejects invalid drop ranges/timestamps and malformed drag data", () => {
  for (const start_ms of [-1, NaN, Infinity])
    expect(() => add(project(), start_ms)).toThrow();
  expect(() =>
    layerInsert(project(), "text", { text: "Title", duration_ms: 0 }),
  ).toThrow();
  expect(() =>
    canvasInsert(project(), [film], {
      asset_id: "film",
      start_ms: 0,
      source: {
        asset_id: "film",
        source_in_ms: 9999,
        duration_ms: 1000,
        mode: "both",
      },
    }),
  ).toThrow();
  const data = (values: Record<string, string>) => ({
    getData: (key: string) => values[key] || "",
  });
  expect(canvasDrop(data({ [elementMime]: "ellipse" }))).toEqual({
    shape: "ellipse",
  });
  expect(
    canvasDrop(
      data({
        "application/synkinema-asset": "film",
        "application/synkinema-source": "{",
      }),
    ),
  ).toBeNull();
  expect(canvasDrop(data({ "application/synkinema-asset": "film" }))).toEqual({
    asset_id: "film",
  });
});
