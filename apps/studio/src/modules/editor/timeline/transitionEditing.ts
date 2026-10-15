import type { EditStep } from "@/api/generated/client";
import { projectAfter } from "@/api/projectReducer";
import { createId } from "@/lib/createId";
import { tr } from "@/lib/i18n";
import type { Project, Track } from "@/lib/types";
import { trackName } from "./timelineEditing";
import { trackHasRoom } from "./timelineMath";

/** Keep rippled sound, captions and overlays intact when a video transition
 * overlaps a preceding clip. Companion lanes retain the original mix settings. */
export function transitionSteps(
  project: Project,
  transition: Extract<EditStep, { type: "set_transition" }>,
): EditStep[] {
  const projected = projectAfter(project, { steps: [transition] });
  const steps: EditStep[] = [transition];
  const created: Track[] = [];
  const order = project.tracks.map((track) => track.id);
  const names = project.tracks.map((track) => track.name);
  for (const original of project.tracks) {
    if (original.kind === "video") continue;
    const lane = projected.tracks.find((track) => track.id === original.id)!;
    const stationary = original.clips.filter(
      (clip) =>
        lane.clips.find((item) => item.id === clip.id)?.start_ms ===
        clip.start_ms,
    );
    const companions: Track[] = [];
    for (const clip of lane.clips) {
      if (stationary.some((item) => item.id === clip.id)) continue;
      if (
        trackHasRoom(
          { ...lane, clips: stationary },
          clip.start_ms,
          clip.duration_ms,
        )
      )
        continue;
      let target = companions.find((track) =>
        trackHasRoom(track, clip.start_ms, clip.duration_ms),
      );
      if (!target) {
        if (project.tracks.length + created.length >= 32)
          throw new Error(
            tr(
              "All 32 tracks are in use. Free a track before adding this transition.",
            ),
          );
        target = {
          ...original,
          id: createId(),
          name: trackName(names, original.kind),
          clips: [],
        };
        names.push(target.name);
        created.push(target);
        companions.push(target);
        order.splice(
          order.indexOf(original.id) + companions.length,
          0,
          target.id,
        );
        steps.push({
          type: "add_track",
          payload: { ...target, clips: [] },
        });
      }
      target.clips.push(clip);
      steps.push({
        type: "move_clip",
        payload: {
          track_id: lane.id,
          clip_id: clip.id,
          target_track_id: target.id,
          start_ms: clip.start_ms,
        },
      });
    }
  }
  if (created.length)
    steps.push({ type: "reorder_tracks", payload: { track_ids: order } });
  return steps;
}
