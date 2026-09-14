import { createId } from "./createId";
import { tr } from "./i18n";
import type { Asset, Project, Track } from "./types";
import type { EditStep } from "./api/generated/client";
import { projectAfter } from "./api/projectReducer";
import {
  defaultAssetGain,
  quantize,
  trackHasRoom,
  audioKinds,
} from "./timelineMath";
import type { SourceSelection } from "./sourceInsert";
export type NewLayerClip = Extract<
  EditStep,
  { type: "add_clip" }
>["payload"]["clip"];
export type Shape = "rectangle" | "ellipse" | "line";
export const elementMime = "application/synkinema-element";
export type CanvasInsert = {
  start_ms: number;
  asset_id?: string;
  shape?: Shape;
  source?: SourceSelection;
  center?: { x: number; y: number };
};
export function layerInsert(
  project: Project,
  kind: Track["kind"],
  input: NewLayerClip,
  preferredId?: string,
) {
  const requested = input.start_ms ?? 0,
    duration = input.duration_ms ?? 4000;
  if (!Number.isFinite(requested) || requested < 0)
    throw new Error(tr("The timeline start must be zero or greater."));
  if (!Number.isInteger(duration) || duration < 100)
    throw new Error(tr("Select at least 0.1 s within the source media."));
  const start = quantize(requested, project.profile.fps);
  const available = (t: Track) =>
    t.kind === kind &&
    !t.muted &&
    t.clips.length < 500 &&
    trackHasRoom(t, start, duration);
  const track =
    preferredId === "new"
      ? undefined
      : project.tracks.find((t) => t.id === preferredId && available(t)) ||
        project.tracks.find(available);
  const id = track?.id || createId();
  const steps: EditStep[] = [];
  if (!track) {
    if (project.tracks.length >= 32)
      throw new Error(
        tr(
          "All 32 tracks are in use. Free a compatible track at the playhead before adding another layer.",
        ),
      );
    const names = {
      video: tr("Video"),
      overlay: tr("Elements"),
      text: tr("Captions"),
      sound: tr("Sound effects"),
      music: tr("Music"),
      voiceover: tr("Voiceover"),
      ambient: tr("Ambience"),
    };
    const base = names[kind];
    let name = base,
      index = 2;
    while (project.tracks.some((t) => t.name === name))
      name = `${base} ${index++}`;
    steps.push({ type: "add_track", payload: { id, name, kind } });
  }
  steps.push({
    type: "add_clip",
    payload: {
      track_id: id,
      clip: {
        ...input,
        id: input.id || createId(),
        start_ms: start,
        duration_ms: duration,
      },
    },
  });
  return { steps, batch: true, track_id: id, start_ms: start };
}
export const audioKind = (asset: Asset): Track["kind"] =>
  asset.tags?.includes("sfx")
    ? "sound"
    : asset.tags?.some((t) => ["voice", "voiceover", "lektor"].includes(t))
      ? "voiceover"
      : "music";
export function canvasInsert(
  project: Project,
  assets: Asset[],
  intent: CanvasInsert,
) {
  const asset = assets.find((a) => a.id === intent.asset_id),
    source = intent.source;
  if (!intent.shape && !asset)
    throw new Error(tr("This media is no longer available."));
  if (intent.shape && !["rectangle", "ellipse", "line"].includes(intent.shape))
    throw new Error(tr("Unknown element type."));
  let duration = asset?.duration_ms || 4000;
  if (source) {
    if (
      !asset ||
      source.asset_id !== asset.id ||
      !["video", "audio", "both"].includes(source.mode) ||
      !Number.isInteger(source.source_in_ms) ||
      !Number.isInteger(source.duration_ms) ||
      source.source_in_ms < 0 ||
      source.duration_ms < 100 ||
      !asset.duration_ms ||
      source.source_in_ms + source.duration_ms > asset.duration_ms
    )
      throw new Error(tr("Select at least 0.1 s within the source media."));
    if (
      (source.mode === "audio" || source.mode === "both") &&
      !asset.has_audio &&
      asset.kind !== "audio"
    )
      throw new Error(tr("This file has no audio."));
    if (source.mode !== "audio" && asset.kind !== "video")
      throw new Error(
        tr("The selected range is not compatible with this track."),
      );
    duration = source.duration_ms;
  }
  if (duration < 100)
    throw new Error(
      tr(
        "This media is shorter than 0.1 s. Choose a longer version of the effect.",
      ),
    );
  const audio = asset?.kind === "audio" || source?.mode === "audio";
  const names = {
    rectangle: tr("Rectangle"),
    ellipse: tr("Ellipse"),
    line: tr("Line"),
  };
  const clip: NewLayerClip = {
    name: asset?.name || names[intent.shape!],
    asset_id: asset?.id || null,
    shape: intent.shape || null,
    start_ms: intent.start_ms,
    duration_ms: duration,
    source_in_ms: source?.source_in_ms || 0,
    gain_db: asset ? defaultAssetGain(asset) : 0,
    ...(!audio
      ? {
          placement: {
            x: intent.center?.x ?? 0.5,
            y: intent.center?.y ?? 0.5,
            width: 0.45,
            height: intent.shape === "line" ? 0.05 : 0.3,
          },
          transform: { fit: "contain" as const },
        }
      : {}),
  };
  const result = layerInsert(
    project,
    audio ? audioKind(asset!) : "overlay",
    clip,
  );
  if (source?.mode === "both") {
    const selected = project.tracks.find((t) => t.id === source.audio_track_id);
    if (
      source.audio_track_id &&
      source.audio_track_id !== "new" &&
      (!selected || !audioKinds.includes(selected.kind))
    )
      throw new Error(
        tr("This audio track is no longer available. Select it again."),
      );
    const sound = layerInsert(
      projectAfter(project, result),
      selected?.kind || "sound",
      {
        asset_id: asset!.id,
        name: tr("{{name}} · audio", { name: asset!.name }),
        start_ms: result.start_ms,
        duration_ms: duration,
        source_in_ms: source.source_in_ms,
        gain_db: defaultAssetGain(asset!),
      },
      source.audio_track_id,
    );
    result.steps.push(...sound.steps);
  }
  return result;
}

export function canvasDrop(
  data: Pick<DataTransfer, "getData">,
): Omit<CanvasInsert, "start_ms" | "center"> | null {
  const shape = data.getData(elementMime);
  if (shape)
    return ["rectangle", "ellipse", "line"].includes(shape)
      ? { shape: shape as Shape }
      : null;
  const asset_id = data.getData("application/synkinema-asset");
  if (!asset_id) return null;
  const raw = data.getData("application/synkinema-source");
  if (!raw) return { asset_id };
  try {
    const source = JSON.parse(raw) as SourceSelection;
    return source && source.asset_id === asset_id ? { asset_id, source } : null;
  } catch {
    return null;
  }
}
