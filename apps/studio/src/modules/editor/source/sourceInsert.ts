import type { Asset, Track } from "@/lib/types";
import { audioKinds } from "@/modules/editor/timeline/timelineMath";

export type SourceSelection = {
  asset_id: string;
  source_in_ms: number;
  duration_ms: number;
  mode: "video" | "audio" | "both";
  audio_track_id?: string;
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
