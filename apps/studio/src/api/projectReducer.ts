import type {
  ClipOutput as Clip,
  EditStep,
  ProjectSnapshot as Project,
  TrackOutput as Track,
} from "@/api/generated/client";
import defaults from "@/api/generated/defaults.json";
import { createId } from "@/lib/createId";

export type EditPlan = {
  steps: EditStep[];
  batch?: boolean;
  restored?: Project;
};
export function identifySteps(steps: EditStep[]): EditStep[] {
  return structuredClone(steps).map((step) => {
    if (step.type === "add_track") step.payload.id ||= createId();
    if (step.type === "add_clip" || step.type === "append_clip")
      step.payload.clip.id ||= createId();
    if (
      step.type === "duplicate_clip" ||
      step.type === "extract_audio" ||
      step.type === "split_clip"
    )
      step.payload.new_clip_id ||= createId();
    return step;
  });
}
function makeClip(value: Partial<Clip>): Clip {
  return {
    ...structuredClone(defaults.clip),
    ...value,
    transform: { ...defaults.clip.transform, ...value.transform },
    placement: { ...defaults.clip.placement, ...value.placement },
    transition: { ...defaults.clip.transition, ...value.transition },
  } as Clip;
}
// Python's round uses ties-to-even; source offsets must match even at fractional speeds.
const sourceRound = (value: number) => {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + (lower % 2) : Math.round(value);
};
const cut = () => ({ type: "cut" as const, duration_ms: 0 });
/** Predict visible edits only. The server validates and replaces this projection on acknowledgement. */
export function projectAfter(project: Project, plan: EditPlan): Project {
  let doc = structuredClone(project);
  for (const step of plan.steps) {
    const p = step.payload as Record<string, any>;
    if (step.type === "restore_revision") {
      if (plan.restored) doc = structuredClone(plan.restored);
      continue;
    }
    if (step.type === "update_project") {
      if ("channel_id" in p && p.channel_id !== doc.channel_id)
        doc.channel_context = null;
      if ("script_lines" in p) {
        p.script_lines = p.script_lines.map((line: object) => ({
          ...defaults.script_line,
          ...line,
        }));
        p.script = p.script_lines
          .map((line: { text: string }) => line.text)
          .join("\n");
      } else if ("script" in p && p.script !== doc.script) {
        p.script_lines = [];
      }
      Object.assign(doc, p);
      if (p.profile) doc.profile = { ...defaults.profile, ...p.profile };
      continue;
    }
    if (step.type === "add_track") {
      doc.tracks.push({
        ...structuredClone(defaults.track),
        ...p,
        clips: (p.clips || []).map(makeClip),
      } as Track);
      continue;
    }
    if (step.type === "reorder_tracks") {
      doc.tracks.sort(
        (a, b) => p.track_ids.indexOf(a.id) - p.track_ids.indexOf(b.id),
      );
      continue;
    }
    const track = doc.tracks.find((t) => t.id === p.track_id);
    if (!track) throw new Error("Track not found");
    if (step.type === "remove_track") {
      doc.tracks = doc.tracks.filter((t) => t !== track);
      continue;
    }
    if (step.type === "update_track") {
      Object.assign(track, p.changes);
      continue;
    }
    if (step.type === "add_clip" || step.type === "append_clip") {
      track.clips.push(
        makeClip({
          ...p.clip,
          ...(step.type === "append_clip"
            ? {
                start_ms: Math.max(
                  0,
                  ...track.clips.map((c) => c.start_ms + c.duration_ms),
                ),
              }
            : {}),
        }),
      );
      continue;
    }
    const clip = track.clips.find((c) => c.id === p.clip_id);
    if (!clip) throw new Error("Clip not found");
    if (step.type === "duplicate_clip" || step.type === "extract_audio") {
      const target = doc.tracks.find(
        (t) => t.id === (p.target_track_id || track.id),
      );
      if (!target) throw new Error("Target track not found");
      const value =
        step.type === "duplicate_clip"
          ? {
              ...clip,
              start_ms:
                p.start_ms ??
                Math.max(
                  0,
                  ...target.clips.map((c) => c.start_ms + c.duration_ms),
                ),
              transition: cut(),
            }
          : Object.fromEntries(
              [
                "name",
                "asset_id",
                "start_ms",
                "duration_ms",
                "source_in_ms",
                "speed",
                "gain_db",
                "fade_in_ms",
                "fade_out_ms",
              ].map((k) => [k, clip[k as keyof Clip]]),
            );
      if (step.type === "extract_audio")
        value.name = `${clip.name.slice(0, 292)} • audio`;
      target.clips.push(makeClip({ ...value, id: p.new_clip_id }));
      continue;
    }
    if (["move_clip", "remove_clip", "trim_clip"].includes(step.type)) {
      const ordered = [...track.clips].sort((a, b) => a.start_ms - b.start_ms);
      const next = ordered[ordered.indexOf(clip) + 1];
      if (next) next.transition = cut();
      if (
        step.type !== "trim_clip" ||
        (p.changes.start_ms ?? clip.start_ms) !== clip.start_ms
      )
        clip.transition = cut();
    }
    if (step.type === "remove_clip")
      track.clips = track.clips.filter((c) => c !== clip);
    else if (step.type === "move_clip") {
      clip.start_ms = p.start_ms;
      if (p.target_track_id && p.target_track_id !== track.id) {
        const target = doc.tracks.find((t) => t.id === p.target_track_id);
        if (!target) throw new Error("Target track not found");
        track.clips = track.clips.filter((c) => c !== clip);
        target.clips.push(clip);
      }
    } else if (step.type === "split_clip") {
      const at = p.time_ms - clip.start_ms;
      const right = {
        ...structuredClone(clip),
        id: p.new_clip_id,
        start_ms: clip.start_ms + at,
        source_in_ms: clip.source_in_ms + sourceRound(at * clip.speed),
        duration_ms: clip.duration_ms - at,
        transition: cut(),
        fade_in_ms: 0,
      };
      clip.duration_ms = at;
      clip.fade_out_ms = 0;
      clip.fade_in_ms = Math.min(clip.fade_in_ms, at);
      right.fade_out_ms = Math.min(right.fade_out_ms, right.duration_ms);
      track.clips.push(right);
    } else if (step.type === "set_transition") {
      const ordered = [...track.clips].sort((a, b) => a.start_ms - b.start_ms);
      const previous = ordered[ordered.indexOf(clip) - 1];
      if (previous) {
        const oldStart = clip.start_ms;
        const delta =
          previous.start_ms +
          previous.duration_ms -
          (p.transition.type === "cut"
            ? 0
            : (p.transition.duration_ms ?? 300)) -
          oldStart;
        for (const lane of doc.tracks)
          for (const c of lane.clips)
            if (c.start_ms >= oldStart) c.start_ms += delta;
        for (const scene of doc.scenes)
          if (scene.start_ms >= oldStart) scene.start_ms += delta;
      }
      clip.transition = { ...defaults.clip.transition, ...p.transition };
    } else if (step.type === "update_clip" || step.type === "trim_clip") {
      const changed = makeClip({ ...clip, ...p.changes });
      Object.assign(clip, changed);
    }
  }
  doc.id = project.id;
  // A projection never claims an unconfirmed server revision. Pending layers are separate.
  doc.revision = project.revision;
  doc.duration_ms = Math.max(
    0,
    ...doc.tracks.flatMap((t) =>
      t.clips.map((c) => c.start_ms + c.duration_ms),
    ),
  );
  return doc;
}
