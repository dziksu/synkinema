import type { Asset, Clip, Track } from "@/lib/types";
export const audioKinds = ["voiceover", "music", "sound", "ambient"];
export const defaultAssetGain = (asset: Asset) =>
  asset.kind === "audio" ? (asset.tags?.includes("sfx") ? -12 : -18) : 0;
export const usableAsset = (asset: Asset) =>
  !asset.duration_ms || asset.duration_ms >= 100;
export const acceptsAsset = (track: Track, asset: Asset) =>
  !usableAsset(asset)
    ? false
    : track.kind === "text"
      ? false
      : ["video", "overlay"].includes(track.kind)
        ? asset.kind !== "audio"
        : asset.kind === "audio" || !!asset.has_audio;
export const extractsAudio = (target: Track, source: Track, asset?: Asset) =>
  ["video", "overlay"].includes(source.kind) &&
  audioKinds.includes(target.kind) &&
  !!asset?.has_audio;
export const acceptsClip = (
  target: Track,
  source: Track,
  asset?: Asset,
  clip?: Clip,
) =>
  clip?.shape
    ? target.kind === "overlay"
    : source.kind === "text"
      ? target.kind === "text"
      : source.kind === "video" || source.kind === "overlay"
        ? (["video", "overlay"].includes(target.kind) && !!asset) ||
          extractsAudio(target, source, asset)
        : audioKinds.includes(target.kind) && !!asset;
export const quantize = (ms: number, fps: number) =>
  Math.max(0, Math.round((Math.round((ms * fps) / 1000) * 1000) / fps));
export function snapTime(
  ms: number,
  edges: number[],
  threshold: number,
  fps: number,
  enabled = true,
) {
  const value = quantize(ms, fps);
  if (!enabled) return { value, snap: null };
  const candidates = edges
    .filter((e) => e >= 0)
    .sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
  const edge = candidates[0];
  return edge !== undefined && Math.abs(edge - value) <= threshold
    ? { value: edge, snap: edge }
    : { value, snap: null };
}
export const trackHasRoom = (
  track: Track,
  start: number,
  duration: number,
  excluded?: string,
) =>
  track.clips.every(
    (c) =>
      c.id === excluded ||
      start + duration <= c.start_ms ||
      start >= c.start_ms + c.duration_ms,
  );
export function freeStart(
  track: Track,
  requested: number,
  duration: number,
  excluded?: string,
) {
  const clips = track.clips
    .filter((c) => c.id !== excluded)
    .sort((a, b) => a.start_ms - b.start_ms);
  const candidates = [
    Math.round(Math.max(0, requested)),
    0,
    ...clips.flatMap((c) => [
      c.start_ms + c.duration_ms,
      c.start_ms - duration,
    ]),
  ].filter((x) => x >= 0);
  return (
    candidates
      .filter((x) =>
        clips.every(
          (c) => x + duration <= c.start_ms || x >= c.start_ms + c.duration_ms,
        ),
      )
      .sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested))[0] ??
    Math.max(0, ...clips.map((c) => c.start_ms + c.duration_ms))
  );
}
export function trimValues(
  clip: Clip,
  side: "left" | "right",
  requested: number,
  asset?: Asset,
  neighbors: Clip[] = [],
) {
  const end = clip.start_ms + clip.duration_ms;
  const prev = Math.max(
    0,
    ...neighbors
      .filter((c) => c.id !== clip.id && c.start_ms < clip.start_ms)
      .map((c) => c.start_ms + c.duration_ms),
  );
  const next = Math.min(
    Infinity,
    ...neighbors
      .filter((c) => c.id !== clip.id && c.start_ms > clip.start_ms)
      .map((c) => c.start_ms),
  );
  if (side === "left") {
    const minSource =
      asset?.kind === "image" || !asset
        ? 0
        : clip.start_ms - clip.source_in_ms / clip.speed;
    const start = Math.round(
      Math.max(0, prev, minSource, Math.min(end - 100, requested)),
    );
    return {
      start_ms: start,
      duration_ms: end - start,
      source_in_ms:
        asset?.kind === "image" || !asset
          ? clip.source_in_ms
          : Math.round(
              clip.source_in_ms + (start - clip.start_ms) * clip.speed,
            ),
    };
  }
  const maxSource = asset?.duration_ms
    ? clip.start_ms + (asset.duration_ms - clip.source_in_ms) / clip.speed
    : Infinity;
  const minimum = Math.max(
    100,
    clip.transition?.type !== "cut"
      ? (clip.transition?.duration_ms || 0) + 1
      : 100,
  );
  return {
    start_ms: clip.start_ms,
    duration_ms: Math.round(
      Math.max(
        minimum,
        Math.min(
          next,
          maxSource,
          Math.max(clip.start_ms + minimum, requested),
        ) - clip.start_ms,
      ),
    ),
    source_in_ms: clip.source_in_ms,
  };
}
export function retimeAnimations(clip: Clip, duration: number) {
  return clip.animations.map((a) => ({
    ...a,
    keyframes: a.keyframes
      .map((k) => ({
        ...k,
        time_ms: Math.round((k.time_ms * duration) / clip.duration_ms),
      }))
      .filter((k, i, arr) => !i || k.time_ms > arr[i - 1].time_ms),
  }));
}

// Leave room for the preview while keeping audio lanes usable below the tools.
export const clampTimelineHeight = (height: number, requested = 340) =>
  Math.max(280, Math.min(requested, height - 360));
