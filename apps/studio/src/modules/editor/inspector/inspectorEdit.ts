import { tr } from "@/lib/i18n";
import type { Asset, Clip, Track } from "@/lib/types";
import {
  freeStart,
  retimeAnimations,
  trimValues,
} from "@/modules/editor/timeline/timelineMath";

// Resolve the user's field edit only when preceding saves have completed.
export function inspectorEdit(
  track: Track,
  clip: Clip,
  input: Partial<Clip>,
  assets: Asset[],
  animationDuration = clip.duration_ms,
) {
  let changes = { ...input };
  const identity = { track_id: track.id, clip_id: clip.id };
  if (changes.transition)
    return {
      type: "set_transition",
      payload: { ...identity, transition: changes.transition },
    };
  if (changes.start_ms !== undefined)
    return {
      type: "move_clip",
      payload: {
        ...identity,
        start_ms: freeStart(track, changes.start_ms, clip.duration_ms, clip.id),
      },
    };
  if (changes.animations && animationDuration !== clip.duration_ms) {
    changes.animations = retimeAnimations(
      {
        ...clip,
        duration_ms: animationDuration,
        animations: changes.animations,
      },
      clip.duration_ms,
    );
  }
  const asset = assets.find((a) => a.id === clip.asset_id);
  if (changes.speed !== undefined || changes.source_in_ms !== undefined) {
    const speed = changes.speed ?? clip.speed,
      source = changes.source_in_ms ?? clip.source_in_ms;
    if (asset?.duration_ms) {
      const available = Math.floor((asset.duration_ms - source) / speed);
      if (available < 100)
        throw new Error(
          tr("The source start must leave at least 0.1 s of media."),
        );
      changes.duration_ms = Math.min(
        changes.duration_ms ?? clip.duration_ms,
        available,
      );
    }
  }
  if (changes.duration_ms !== undefined) {
    const adjusted = { ...clip, ...changes };
    const values = trimValues(
      adjusted,
      "right",
      clip.start_ms + changes.duration_ms,
      asset,
      track.clips,
    );
    changes = {
      ...changes,
      ...values,
      animations: retimeAnimations(clip, values.duration_ms),
      fade_in_ms: Math.min(clip.fade_in_ms, values.duration_ms),
      fade_out_ms: Math.min(clip.fade_out_ms, values.duration_ms),
    };
    return { type: "trim_clip", payload: { ...identity, changes } };
  }
  return { type: "update_clip", payload: { ...identity, changes } };
}
