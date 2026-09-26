import type { EditStep } from "@/api/generated/client";
import { createId } from "@/lib/createId";
import { tr } from "@/lib/i18n";
import type { Asset, Clip, Project, Track } from "@/lib/types";
import {
  acceptsClip,
  audioKinds,
  defaultAssetGain,
  extractsAudio,
  freeStart,
  quantize,
  trackHasRoom,
  usableAsset,
} from "@/modules/editor/timeline/timelineMath";

// Pure planning for multi-clip timeline edits. Every plan becomes ONE batch, so a
// gesture is validated atomically by the server and undone as a single revision.

export const visualKinds: Track["kind"][] = ["video", "overlay"];
const maxTracks = 32;

export type Located = { track: Track; clip: Clip };
export function locate(project: Project, clipId: string): Located | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
}

/** Picture and sound of one source placed in sync (same asset, source range and
 * timing on a visual and an audio track) behave as a linked pair. */
export function linkedClipIds(project: Project, clipId: string): string[] {
  const at = locate(project, clipId);
  if (!at?.clip.asset_id) return [];
  const visual = visualKinds.includes(at.track.kind);
  if (!visual && !audioKinds.includes(at.track.kind)) return [];
  return project.tracks
    .filter(
      (t) =>
        t.id !== at.track.id &&
        (visual ? audioKinds.includes(t.kind) : visualKinds.includes(t.kind)),
    )
    .flatMap((t) =>
      t.clips
        .filter(
          (c) =>
            c.asset_id === at.clip.asset_id &&
            c.start_ms === at.clip.start_ms &&
            c.duration_ms === at.clip.duration_ms &&
            c.source_in_ms === at.clip.source_in_ms &&
            c.speed === at.clip.speed,
        )
        .map((c) => c.id),
    );
}

/** Every clip that currently has a linked partner, in one pass. */
export function linkedClipSet(project: Project) {
  const key = (c: Clip) =>
    [c.asset_id, c.start_ms, c.duration_ms, c.source_in_ms, c.speed].join("|");
  const sides = new Map<string, { visual: string[]; audio: string[] }>();
  for (const track of project.tracks) {
    const visual = visualKinds.includes(track.kind);
    if (!visual && !audioKinds.includes(track.kind)) continue;
    for (const clip of track.clips) {
      if (!clip.asset_id) continue;
      const entry = sides.get(key(clip)) ?? { visual: [], audio: [] };
      entry[visual ? "visual" : "audio"].push(clip.id);
      sides.set(key(clip), entry);
    }
  }
  return new Set(
    [...sides.values()]
      .filter((e) => e.visual.length && e.audio.length)
      .flatMap((e) => [...e.visual, ...e.audio]),
  );
}

export function withLinked(project: Project, ids: string[], linking = true) {
  const all = new Set(ids.filter((id) => locate(project, id)));
  if (linking)
    for (const id of [...all])
      for (const partner of linkedClipIds(project, id)) all.add(partner);
  return [...all];
}

/** Clips whose rendered boxes intersect a marquee, in timeline coordinates. */
export function clipsInRange(
  project: Project,
  trackIds: string[],
  from: number,
  to: number,
) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return project.tracks
    .filter((t) => trackIds.includes(t.id))
    .flatMap((t) =>
      t.clips
        .filter((c) => c.start_ms < end && c.start_ms + c.duration_ms > start)
        .map((c) => c.id),
    );
}

const names = () =>
  ({
    video: tr("Video"),
    overlay: tr("Video overlay"),
    text: tr("Captions"),
    sound: tr("Audio"),
    music: tr("Music"),
    voiceover: tr("Voiceover"),
    ambient: tr("Ambience"),
  }) as Record<Track["kind"], string>;

export function trackName(taken: string[], kind: Track["kind"]) {
  const base = names()[kind];
  let name = base,
    index = 2;
  while (taken.includes(name)) name = `${base} ${index++}`;
  return name;
}

/** A new lane directly below `after` (drawn above it in the composition). */
export type NewTrack = { id: string; kind: Track["kind"]; after?: string };

/** Kind of the lane that receives an item that collided with `track`. There is
 * one primary video track; additional pictures always become overlays. */
export const companionKind = (track: Track): Track["kind"] =>
  track.kind === "video" ? "overlay" : track.kind;

function trackSteps(project: Project, created: NewTrack[]): EditStep[] {
  if (!created.length) return [];
  if (project.tracks.length + created.length > maxTracks)
    throw new Error(
      tr(
        "All 32 tracks are in use. Free a compatible track at the playhead before adding another layer.",
      ),
    );
  const taken = project.tracks.map((t) => t.name);
  const steps: EditStep[] = created.map((t) => {
    const name = trackName(taken, t.kind);
    taken.push(name);
    return { type: "add_track", payload: { id: t.id, name, kind: t.kind } };
  });
  const order = project.tracks.map((t) => t.id);
  for (const t of created) {
    const index = t.after ? order.indexOf(t.after) : -1;
    if (index < 0) order.push(t.id);
    else order.splice(index + 1, 0, t.id);
  }
  if (created.some((t) => t.after))
    steps.push({ type: "reorder_tracks", payload: { track_ids: order } });
  return steps;
}

export type MoveItem = {
  clip: Clip;
  from: Track;
  /** Existing destination; undefined means the plan's new track. */
  to?: Track;
  start: number;
  extract?: boolean;
};
export type MovePlan = {
  valid: boolean;
  delta: number;
  items: MoveItem[];
  newTrack?: NewTrack;
};

/**
 * Plan dragging `anchor` (and the rest of `ids`) by `delta` ms. Only the anchor
 * and its linked partner may change lanes: the anchor follows the pointer while
 * partners keep their tracks and stay in sync. A collision on a different lane
 * suggests a new lane below it instead of rejecting the drop.
 */
export function planMove(
  project: Project,
  assets: Asset[],
  {
    anchor,
    ids,
    target,
    delta,
    newTrackId = createId(),
    forceNewTrack = false,
  }: {
    anchor: string;
    ids: string[];
    target?: string;
    delta: number;
    newTrackId?: string;
    /** Pointer is over the suggested lane: keep proposing it. */
    forceNewTrack?: boolean;
  },
): MovePlan {
  const origin = locate(project, anchor);
  if (!origin) return { valid: false, delta: 0, items: [] };
  const group = ids
    .filter((id) => id !== anchor)
    .map((id) => locate(project, id))
    .filter((x): x is Located => !!x);
  const linked = new Set(linkedClipIds(project, anchor));
  const onlyLinked = group.every((g) => linked.has(g.clip.id));
  const asset = assets.find((a) => a.id === origin.clip.asset_id);
  const lane =
    (onlyLinked && project.tracks.find((t) => t.id === target)) || origin.track;
  const extract = extractsAudio(lane, origin.track, asset);
  const members = extract ? [] : group;
  const moving = new Set([anchor, ...members.map((g) => g.clip.id)]);
  const earliest = Math.min(
    origin.clip.start_ms,
    ...members.map((g) => g.clip.start_ms),
  );
  const d = Math.max(-earliest, Math.round(delta));
  const fits = (track: Track, start: number, duration: number) =>
    track.clips.every(
      (c) =>
        moving.has(c.id) ||
        start + duration <= c.start_ms ||
        start >= c.start_ms + c.duration_ms,
    );
  const items: MoveItem[] = members.map((g) => ({
    clip: g.clip,
    from: g.track,
    to: g.track,
    start: g.clip.start_ms + d,
  }));
  let start = origin.clip.start_ms + d;
  let newTrack: NewTrack | undefined;
  const compatible = acceptsClip(lane, origin.track, asset, origin.clip);
  if (compatible && forceNewTrack && onlyLinked)
    newTrack = { id: newTrackId, kind: companionKind(lane), after: lane.id };
  else if (compatible && !fits(lane, start, origin.clip.duration_ms)) {
    if (lane.id !== origin.track.id)
      newTrack = { id: newTrackId, kind: companionKind(lane), after: lane.id };
    else if (!members.length)
      // Sliding a lone clip along its own lane settles into the nearest gap.
      start = freeStart(lane, start, origin.clip.duration_ms, anchor);
  }
  items.unshift({
    clip: origin.clip,
    from: origin.track,
    to: newTrack ? undefined : lane,
    start,
    extract,
  });
  const valid =
    compatible &&
    (start !== origin.clip.start_ms ||
      lane.id !== origin.track.id ||
      !!newTrack) &&
    items.every(
      (item) => !item.to || fits(item.to, item.start, item.clip.duration_ms),
    );
  return { valid, delta: d, items, newTrack };
}

export function moveSteps(project: Project, plan: MovePlan): EditStep[] {
  const steps = trackSteps(project, plan.newTrack ? [plan.newTrack] : []);
  for (const item of plan.items) {
    const to = item.to?.id ?? plan.newTrack!.id;
    if (item.extract)
      steps.push({
        type: "add_clip",
        payload: {
          track_id: to,
          clip: {
            asset_id: item.clip.asset_id,
            name: tr("Audio · {{name}}", { name: item.clip.name }),
            start_ms: item.start,
            duration_ms: item.clip.duration_ms,
            source_in_ms: item.clip.source_in_ms,
            speed: item.clip.speed,
            gain_db: item.clip.gain_db,
            fade_in_ms: item.clip.fade_in_ms,
            fade_out_ms: item.clip.fade_out_ms,
          },
        },
      });
    else
      steps.push({
        type: "move_clip",
        payload: {
          track_id: item.from.id,
          clip_id: item.clip.id,
          start_ms: item.start,
          ...(to !== item.from.id ? { target_track_id: to } : {}),
        },
      });
  }
  return steps;
}

export type MediaInsert = {
  asset_id: string;
  start_ms: number;
  /** Lane under the pointer (exact) or the preferred lane (auto). */
  track_id?: string;
  /** exact: keep the requested lane or open a new one below it.
   *  auto: reuse any compatible lane free at start_ms before opening one. */
  placement?: "exact" | "auto";
  source_in_ms?: number;
  duration_ms?: number;
  mode?: "video" | "audio" | "both";
  audio_track_id?: string;
  /** Always open a new lane below track_id (pointer over the suggested lane). */
  new_track?: boolean;
  new_track_ids?: [string, string];
};
export type MediaPlan = {
  steps: EditStep[];
  track_id: string;
  start_ms: number;
  duration_ms: number;
  newTrack?: NewTrack;
  audio?: { track_id: string; created: boolean };
};

export const defaultMode = (asset: Asset): NonNullable<MediaInsert["mode"]> =>
  asset.kind === "audio"
    ? "audio"
    : asset.kind === "video" && asset.has_audio
      ? "both"
      : "video";

export const audioKindFor = (asset: Asset): Track["kind"] =>
  asset.tags?.includes("sfx")
    ? "sound"
    : asset.tags?.some((t) => ["voice", "voiceover", "lektor"].includes(t))
      ? "voiceover"
      : asset.kind === "audio"
        ? "music"
        : "sound";

/**
 * Plan inserting media at a time. Video with sound always lands as a picture
 * clip plus a synchronized clip on an audio lane (only audio lanes are mixed),
 * so either half can later be removed on its own.
 */
export function planMediaInsert(
  project: Project,
  assets: Asset[],
  intent: MediaInsert,
): MediaPlan {
  const asset = assets.find((a) => a.id === intent.asset_id);
  if (!asset) throw new Error(tr("This media is no longer available."));
  if (!usableAsset(asset))
    throw new Error(
      tr(
        "This media is shorter than 0.1 s. Choose a longer version of the effect.",
      ),
    );
  const mode = intent.mode ?? defaultMode(asset);
  if (mode !== "audio" && asset.kind === "audio")
    throw new Error(
      tr("The selected range is not compatible with this track."),
    );
  if (mode !== "video" && asset.kind !== "audio" && !asset.has_audio)
    throw new Error(tr("This file has no audio."));
  const sourceIn = intent.source_in_ms ?? 0;
  const duration =
    intent.duration_ms ??
    (asset.duration_ms ? asset.duration_ms - sourceIn : 4000);
  if (
    !Number.isInteger(sourceIn) ||
    !Number.isInteger(duration) ||
    sourceIn < 0 ||
    duration < 100 ||
    (asset.kind !== "image" &&
      !!asset.duration_ms &&
      sourceIn + duration > asset.duration_ms)
  )
    throw new Error(tr("Select at least 0.1 s within the source media."));
  if (!Number.isFinite(intent.start_ms) || intent.start_ms < 0)
    throw new Error(tr("The timeline start must be zero or greater."));
  const start = quantize(intent.start_ms, project.profile.fps);
  const [pictureId, soundId] = intent.new_track_ids ?? [createId(), createId()];
  const audioLane = mode === "audio";
  const accepts = (t: Track) =>
    audioLane ? audioKinds.includes(t.kind) : visualKinds.includes(t.kind);
  const room = (t: Track) =>
    t.clips.length < 500 && trackHasRoom(t, start, duration);
  const requested = project.tracks.find(
    (t) => t.id === intent.track_id && accepts(t),
  );
  const preferredKind = audioLane ? audioKindFor(asset) : "video";
  let lane: Track | undefined;
  let newTrack: NewTrack | undefined;
  if (intent.placement === "exact" && intent.track_id) {
    if (!requested)
      throw new Error(
        tr("The selected range is not compatible with this track."),
      );
    lane = room(requested) && !intent.new_track ? requested : undefined;
    if (!lane)
      newTrack = {
        id: pictureId,
        kind: companionKind(requested),
        after: requested.id,
      };
  } else {
    const free = project.tracks.filter(
      (t) => accepts(t) && !t.muted && room(t),
    );
    lane =
      (requested && room(requested) ? requested : undefined) ||
      free.find((t) => t.kind === preferredKind) ||
      free[0];
    if (!lane) {
      const anchor =
        requested ||
        [...project.tracks]
          .reverse()
          .find((t) => accepts(t) && t.kind === preferredKind) ||
        [...project.tracks].reverse().find(accepts);
      const kind = anchor
        ? companionKind(anchor)
        : audioLane
          ? preferredKind
          : project.tracks.some((t) => t.kind === "video" && !t.muted)
            ? "overlay"
            : "video";
      newTrack = { id: pictureId, kind, after: anchor?.id };
    }
  }
  const created: NewTrack[] = newTrack ? [newTrack] : [];
  const trackId = lane?.id ?? newTrack!.id;
  const clip = {
    id: createId(),
    asset_id: asset.id,
    name:
      intent.source_in_ms !== undefined || intent.duration_ms !== undefined
        ? tr("{{name}} · range", { name: asset.name })
        : asset.name,
    start_ms: start,
    duration_ms: duration,
    source_in_ms: sourceIn,
    gain_db: defaultAssetGain(asset),
  };
  const clips: EditStep[] = [
    { type: "add_clip", payload: { track_id: trackId, clip } },
  ];
  let audio: MediaPlan["audio"];
  if (mode === "both") {
    const sound = project.tracks.filter(
      (t) => audioKinds.includes(t.kind) && !t.muted && room(t),
    );
    const existing =
      sound.find((t) => t.id === intent.audio_track_id) ||
      sound.find((t) => t.kind === "sound") ||
      sound.find((t) => t.kind === "ambient") ||
      sound.find((t) => t.kind !== "voiceover");
    const audioTrack = existing?.id ?? soundId;
    if (!existing) {
      const last = [...project.tracks]
        .reverse()
        .find((t) => audioKinds.includes(t.kind) && t.kind !== "voiceover");
      created.push({ id: soundId, kind: "sound", after: last?.id });
    }
    audio = { track_id: audioTrack, created: !existing };
    clips.push({
      type: "add_clip",
      payload: {
        track_id: audioTrack,
        clip: {
          ...clip,
          id: createId(),
          name: tr("{{name}} · audio", { name: asset.name }),
          gain_db: 0,
        },
      },
    });
  }
  return {
    steps: [...trackSteps(project, created), ...clips],
    track_id: trackId,
    start_ms: start,
    duration_ms: duration,
    newTrack,
    audio,
  };
}

/** Remove clips that still exist; linked halves are removed only if selected. */
export function removeSteps(project: Project, ids: string[]): EditStep[] {
  return ids
    .map((id) => locate(project, id))
    .filter((x): x is Located => !!x)
    .map(({ track, clip }) => ({
      type: "remove_clip",
      payload: { track_id: track.id, clip_id: clip.id },
    }));
}
