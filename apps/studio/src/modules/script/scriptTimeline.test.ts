import type { Asset, ProjectSnapshot } from "@/api/generated/client";
import cases from "@/api/generated/edit-cases.json";
import { projectAfter } from "@/api/projectReducer";
import { expect, it } from "vitest";
import {
  planScriptTake,
  scriptCaptionClipId,
  scriptTakeStatus,
  scriptVoiceClipId,
} from "./scriptTimeline";

function sample() {
  const fixture = structuredClone(
    cases.find((item) => item.name === "replace_script_audio")!,
  ) as unknown as {
    before: ProjectSnapshot;
    plan: { audioAssets: Record<string, Asset> };
  };
  return {
    project: fixture.before,
    old: fixture.plan.audioAssets.old,
    next: fixture.plan.audioAssets.new,
  };
}

it("places a ready script take after existing narration without making captions", () => {
  const { project, next } = sample();
  project.script_lines[0].audio_asset_id = next.id;
  const line = project.script_lines[0];
  const plan = planScriptTake(project, line, next, 0, false);
  const result = projectAfter(project, plan);
  const clip = result.tracks
    .find((track) => track.kind === "voiceover")!
    .clips.find((item) => item.id === scriptVoiceClipId(line.id))!;
  expect(clip.asset_id).toBe(next.id);
  expect(clip.start_ms).toBeGreaterThanOrEqual(1100);
  expect(clip.duration_ms).toBe(next.duration_ms);
  expect(result.tracks.filter((track) => track.kind === "text")).toHaveLength(
    0,
  );
});

it("adds voice and one centered subtitle for the actual spoken text in one plan", () => {
  const { project, next } = sample();
  project.script_lines[0] = {
    ...project.script_lines[0],
    audio_asset_id: next.id,
    audio_text: "Spoken words",
    text: "An unsaved edit",
  };
  const line = project.script_lines[0];
  const plan = planScriptTake(project, line, next, 0, true);
  const result = projectAfter(project, plan);
  const voice = result.tracks
    .find((track) => track.kind === "voiceover")!
    .clips.find((item) => item.id === scriptVoiceClipId(line.id))!;
  const caption = result.tracks
    .find((track) => track.kind === "text")!
    .clips.find((item) => item.id === scriptCaptionClipId(line.id))!;
  expect(plan.steps.map((step) => step.type)).toEqual([
    "add_clip",
    "add_track",
    "add_clip",
  ]);
  expect(caption).toMatchObject({
    text: "Spoken words",
    start_ms: voice.start_ms,
    duration_ms: voice.duration_ms,
    caption_style: "boxed",
    text_auto_center: true,
  });
});

it("uses a shared gap for voice and subtitles when another text clip occupies the playhead", () => {
  const { project, next } = sample();
  project.script_lines[0].audio_asset_id = next.id;
  project.tracks.push({
    ...project.tracks[0],
    id: "captions",
    name: "Captions",
    kind: "text",
    clips: [
      {
        ...project.tracks[0].clips[0],
        id: "existing-caption",
        asset_id: null,
        text: "Existing",
        start_ms: 1100,
        duration_ms: 1000,
      },
    ],
  });
  const plan = planScriptTake(project, project.script_lines[0], next, 0, true);
  expect(plan.start_ms).toBeGreaterThanOrEqual(2100);
  const result = projectAfter(project, plan);
  const caption = result.tracks
    .find((track) => track.kind === "text")!
    .clips.find(
      (item) => item.id === scriptCaptionClipId(project.script_lines[0].id),
    )!;
  expect(caption.start_ms).toBe(plan.start_ms);
});

it("adds or updates subtitles for a take already on the timeline without duplicating audio", () => {
  const { project, old } = sample();
  const line = project.script_lines[0];
  const first = planScriptTake(project, line, old, 0, true);
  expect(first.steps.map((step) => step.type)).toEqual([
    "add_track",
    "add_clip",
  ]);
  const withCaption = projectAfter(project, first);
  expect(scriptTakeStatus(withCaption, line).captionsSynced).toBe(true);
  const updatedLine = { ...line, audio_text: "Updated spoken words" };
  withCaption.script_lines[0] = updatedLine;
  const sync = planScriptTake(withCaption, updatedLine, old, 0, true);
  expect(sync.steps.map((step) => step.type)).toEqual(["update_clip"]);
  expect(
    scriptTakeStatus(projectAfter(withCaption, sync), updatedLine)
      .captionsSynced,
  ).toBe(true);
  expect(() => planScriptTake(withCaption, updatedLine, old, 0, false)).toThrow(
    "already on the timeline",
  );
});

it("reuses an orphaned script caption when the narration is placed again", () => {
  const { project, old } = sample();
  const line = project.script_lines[0];
  const caption = planScriptTake(project, line, old, 0, true);
  const withCaption = projectAfter(project, caption);
  const voiceTrack = withCaption.tracks.find(
    (track) => track.kind === "voiceover",
  )!;
  voiceTrack.clips = [];
  const restored = planScriptTake(withCaption, line, old, 0, true);
  expect(restored.steps.map((step) => step.type)).toEqual([
    "add_clip",
    "update_clip",
  ]);
  const result = projectAfter(withCaption, restored);
  expect(
    result.tracks
      .flatMap((track) => track.clips)
      .filter((clip) => clip.id === scriptCaptionClipId(line.id)),
  ).toHaveLength(1);
  expect(scriptTakeStatus(result, line).captionsSynced).toBe(true);
});

it("does not confuse two script lines sharing the same take", () => {
  const { project } = sample();
  const other = { ...project.script_lines[0], id: "second-line" };
  project.script_lines.push(other);
  expect(scriptTakeStatus(project, other)).toMatchObject({
    clip: undefined,
    ambiguous: true,
  });
});
