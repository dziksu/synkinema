import { createId } from "@/lib/createId";
import { tr } from "@/lib/i18n";
import type { Asset, Project, Track } from "@/lib/types";
import {
  audioKinds,
  defaultAssetGain,
} from "@/modules/editor/timeline/timelineMath";

export type SourceSelection = {
  asset_id: string;
  source_in_ms: number;
  duration_ms: number;
  mode: "video" | "audio" | "both";
  audio_track_id?: string;
};
export type SourceInsert = SourceSelection & {
  track_id: string;
  start_ms: number;
  append?: boolean;
};
export const sourceMime = "application/synkinema-source";
export function acceptsSource(
  track: Track,
  asset: Asset,
  selection: SourceSelection,
) {
  return selection.mode === "audio"
    ? audioKinds.includes(track.kind) &&
        (asset.kind === "audio" || !!asset.has_audio)
    : ["video", "overlay"].includes(track.kind) && asset.kind === "video";
}

export function sourceStart(
  target: Track,
  requested: number,
  duration: number,
  append = false,
) {
  let start = append
    ? Math.max(0, ...target.clips.map((c) => c.start_ms + c.duration_ms))
    : Math.round(requested);
  for (const clip of [...target.clips].sort(
    (a, b) => a.start_ms - b.start_ms,
  )) {
    if (
      start < clip.start_ms + clip.duration_ms &&
      start + duration > clip.start_ms
    )
      start = clip.start_ms + clip.duration_ms;
  }
  return start;
}

export function sourceInsert(
  project: Project,
  assets: Asset[],
  intent: SourceInsert,
) {
  const asset = assets.find((a) => a.id === intent.asset_id);
  const target = project.tracks.find((t) => t.id === intent.track_id);
  if (!asset || !target)
    throw new Error(tr("This media or track is no longer available."));
  if (
    !["video", "audio", "both"].includes(intent.mode) ||
    !acceptsSource(target, asset, intent)
  )
    throw new Error(
      tr("The selected range is not compatible with this track."),
    );
  const { source_in_ms: source, duration_ms: duration } = intent;
  if (
    !Number.isInteger(source) ||
    !Number.isInteger(duration) ||
    source < 0 ||
    duration < 100 ||
    !asset.duration_ms ||
    source + duration > asset.duration_ms
  )
    throw new Error(tr("Select at least 0.1 s within the source media."));
  if (!Number.isFinite(intent.start_ms) || intent.start_ms < 0)
    throw new Error(tr("The timeline start must be zero or greater."));
  let start = sourceStart(target, intent.start_ms, duration, intent.append);
  if (
    intent.mode === "both" &&
    intent.audio_track_id &&
    intent.audio_track_id !== "new"
  ) {
    const audioTrack = project.tracks.find(
      (t) => t.id === intent.audio_track_id,
    );
    if (!audioTrack || !audioKinds.includes(audioTrack.kind))
      throw new Error(
        tr("This audio track is no longer available. Select it again."),
      );
    // Both copies must share a gap; never shift only one side of the pair.
    for (let i = 0; i <= target.clips.length + audioTrack.clips.length; i++) {
      const next = sourceStart(
        target,
        sourceStart(audioTrack, start, duration),
        duration,
      );
      if (next === start) break;
      start = next;
    }
  }
  const clip = {
    asset_id: asset.id,
    name: tr("{{name}} · range", { name: asset.name }),
    source_in_ms: source,
    duration_ms: duration,
    start_ms: start,
    gain_db: defaultAssetGain(asset),
  };
  const operations: { type: string; payload: Record<string, unknown> }[] = [
    { type: "add_clip", payload: { track_id: target.id, clip } },
  ];
  if (intent.mode === "both") {
    if (!asset.has_audio) throw new Error(tr("This file has no audio."));
    let audioId = intent.audio_track_id;
    if (!audioId || audioId === "new") {
      audioId = createId();
      operations.push({
        type: "add_track",
        payload: { id: audioId, name: tr("Source audio"), kind: "sound" },
      });
    } else if (
      !project.tracks.some(
        (t) => t.id === audioId && audioKinds.includes(t.kind),
      )
    ) {
      throw new Error(
        tr("This audio track is no longer available. Select it again."),
      );
    }
    operations.push({
      type: "add_clip",
      payload: {
        track_id: audioId,
        clip: { ...clip, name: tr("{{name}} · audio", { name: asset.name }) },
      },
    });
  }
  return { operations, start_ms: start };
}
