import { expect, it } from "vitest";
import defaults from "./api/generated/defaults.json";
import { previewLayers } from "./previewLayers";
import type { Clip, Project } from "./types";

function twoShots(changes: Partial<Clip> = {}) {
  const project = structuredClone(defaults.project) as Project;
  project.id = "one";
  const first = {
    ...structuredClone(defaults.clip),
    id: "first",
    asset_id: "movie",
    duration_ms: 3000,
  } as Clip;
  const second = {
    ...structuredClone(first),
    id: "second",
    start_ms: 3000,
    source_in_ms: 3000,
    ...changes,
  };
  project.tracks[0].clips = [first, second];
  return project;
}

it.each([
  { asset_id: "another-source" },
  { source_in_ms: 4000 },
  { speed: 2 },
  { start_ms: 3100 },
  { transition: { type: "crossfade", duration_ms: 300 } },
  { shape: "rectangle" },
] satisfies Partial<Clip>[])(
  "does not join discontinuous or transitioning layers: %j",
  (changes) => {
    const project = twoShots(changes);
    const first = previewLayers(project, 2999)[0];
    const second = previewLayers(project, changes.start_ms ?? 3000)[0];
    expect(first.key).not.toBe(second.key);
  },
);

it("keeps overlapping copies and different tracks distinct", () => {
  const project = twoShots({ start_ms: 2700, source_in_ms: 2700 });
  project.tracks[0].clips[1].transition = {
    type: "crossfade",
    duration_ms: 300,
  };
  const overlay = structuredClone(project.tracks[0]);
  overlay.id = "overlay";
  overlay.kind = "overlay";
  project.tracks.push(overlay);
  const layers = previewLayers(project, 2800);
  expect(layers).toHaveLength(4);
  expect(new Set(layers.map((layer) => layer.key)).size).toBe(4);
});

it("does not show an old run in a timeline gap or another project", () => {
  const project = twoShots({ start_ms: 3100 });
  expect(previewLayers(project, 3050)).toEqual([]);
  const first = previewLayers(project, 1000)[0];
  const another = { ...project, id: "two" };
  expect(previewLayers(another, 1000)[0].key).not.toBe(first.key);
});

it("keeps caption identities and caller-owned clip order", () => {
  const project = twoShots();
  project.tracks[0].kind = "text";
  project.tracks[0].clips.reverse();
  const before = structuredClone(project);
  const first = previewLayers(project, 2999)[0];
  const second = previewLayers(project, 3000)[0];
  expect(first.key).not.toBe(second.key);
  expect(project).toEqual(before);
});
