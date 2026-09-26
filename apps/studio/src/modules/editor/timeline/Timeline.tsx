import { Button } from "@/components/ui/button";
import { createId } from "@/lib/createId";
import { tr, trackKindLabel, useLocale } from "@/lib/i18n";
import type { Asset, Clip, Project, Review, Track } from "@/lib/types";
import {
  acceptsSource,
  sourceMime,
  type SourceSelection,
} from "@/modules/editor/source/sourceInsert";
import { useStudio } from "@/modules/editor/store";
import {
  AudioEnvelope,
  TimelineSelectionTools,
  TrackGain,
  type TimelineEdit,
} from "@/modules/editor/timeline/TimelineAudioControls";
import {
  clipsInRange,
  linkedClipSet,
  planMediaInsert,
  planMove,
  withLinked,
  type MediaInsert,
  type NewTrack,
} from "@/modules/editor/timeline/timelineEditing";
import {
  acceptsAsset,
  audioKinds,
  retimeAnimations,
  snapTime,
  trimValues,
} from "@/modules/editor/timeline/timelineMath";
import TimelineTrackMenu from "@/modules/editor/timeline/TimelineTrackMenu";
import {
  Eye,
  EyeOff,
  Film,
  Link2,
  Magnet,
  Music2,
  Plus,
  Type,
  Unlink2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { SortableTrack, TrackHandle, TrackSorting } from "./track-sorting";
const tc = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const headerWidth = 220;
/** Ghost items on "new" belong to the suggested lane below newTrack.after. */
type GhostItem = {
  track: string;
  start: number;
  duration: number;
  name: string;
};
type Ghost = {
  items: GhostItem[];
  valid: boolean;
  snap: number | null;
  newTrack?: NewTrack;
  note?: string;
};
type Gesture = {
  clip: Clip;
  track: Track;
  side: "move" | "left" | "right";
  x: number;
  y: number;
  scroll: number;
  moved: boolean;
  /** Clips travelling with the anchor (selection plus linked sound). */
  ids: string[];
  /** Plain click inside a multi-selection narrows it on release. */
  collapse: boolean;
  newTrackId: string;
  move?: { target?: string; delta: number; force: boolean };
};
type Marquee = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  base: string[];
  moved: boolean;
};
export default function Timeline({
  project,
  assets,
  zoom,
  reviews,
  onEdit,
}: {
  project: Project;
  assets: Asset[];
  zoom: number;
  reviews: Review[];
  onEdit: TimelineEdit;
}) {
  useLocale();
  const selected = useStudio((s) => s.selectedId),
    selectedIds = useStudio((s) => s.selectedIds),
    linking = useStudio((s) => s.linking),
    draggingAsset = useStudio((s) => s.draggingAsset),
    draggingSource = useStudio((s) => s.draggingSource),
    set = useStudio((s) => s.set);
  const scroll = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    ghostRef = useRef<Ghost | null>(null),
    marqueeRef = useRef<Marquee | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null),
    [marquee, setMarquee] = useState<Marquee | null>(null),
    [snap, setSnap] = useState(true);
  const selectedTrack = project.tracks.find((t) =>
    t.clips.some((c) => c.id === selected),
  );
  const selectedClip = selectedTrack?.clips.find((c) => c.id === selected);
  const chosen = new Set(selectedIds);
  const linked = new Set(
    withLinked(project, selectedIds, linking).filter((id) => !chosen.has(id)),
  );
  const pairs = linking ? linkedClipSet(project) : new Set<string>();
  useEffect(() => {
    if (!draggingAsset && !gesture.current) {
      ghostRef.current = null;
      setGhost(null);
    }
  }, [draggingAsset]);
  useEffect(() => {
    const viewport = scroll.current;
    if (!selected || !viewport || gesture.current) return;
    const clip = [
      ...viewport.querySelectorAll<HTMLElement>("[data-clip-id]"),
    ].find((el) => el.dataset.clipId === selected);
    if (!clip) return;
    // Reveal a new layer vertically without moving time zero under sticky labels.
    const frame = viewport.getBoundingClientRect(),
      box = clip.getBoundingClientRect();
    if (box.bottom > frame.bottom)
      viewport.scrollTop += box.bottom - frame.bottom + 8;
    else if (box.top < frame.top + 28)
      viewport.scrollTop += box.top - frame.top - 28;
  }, [selected]);
  const px = 0.06 * zoom,
    duration = Math.max(project.duration_ms + 5000, 20000),
    width = duration * px;
  const preview = (g: Ghost | null) => {
    ghostRef.current = g;
    setGhost(g);
  };
  const edges = (excluded: string[] = []) => [
    0,
    useStudio.getState().time,
    ...project.tracks.flatMap((t) =>
      t.clips
        .filter((c) => !excluded.includes(c.id))
        .flatMap((c) => [c.start_ms, c.start_ms + c.duration_ms]),
    ),
  ];
  const position = (x: number, lane: HTMLElement) =>
    Math.max(0, (x - lane.getBoundingClientRect().left) / px);
  const seek = (x: number, lane: HTMLElement) =>
    set({
      time: Math.min(Math.max(0, project.duration_ms - 1), position(x, lane)),
      playing: false,
    });
  const autoScroll = (x: number, y: number) => {
    const container = scroll.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (x > rect.right - 32) container.scrollLeft += 14;
    else if (x < rect.left + 180) container.scrollLeft -= 14;
    if (y > rect.bottom - 24) container.scrollTop += 10;
    else if (y < rect.top + 42) container.scrollTop -= 10;
  };
  const cancel = () => {
    gesture.current = null;
    preview(null);
  };
  const select = (ids: string[], primary?: string | null) =>
    set({
      selectedIds: ids,
      selectedId: primary !== undefined ? primary : (ids.at(-1) ?? null),
      playing: false,
    });
  const ghostNote = (
    plan: { newTrack?: NewTrack; audio?: { created: boolean } },
    name: string,
  ) =>
    [
      plan.newTrack &&
        tr("Drop to add a new {{kind}} track", {
          kind: trackKindLabel(plan.newTrack.kind).toLowerCase(),
        }),
      plan.audio && tr("Video and audio"),
      name,
    ]
      .filter(Boolean)
      .join(" · ");
  const finish = () => {
    const d = gesture.current,
      g = ghostRef.current;
    cancel();
    if (!d) return;
    if (!d.moved) {
      if (d.collapse) select([d.clip.id], d.clip.id);
      return;
    }
    if (!g || !g.valid) return;
    if (d.side === "move" && d.move)
      onEdit("move_clips", {
        anchor: d.clip.id,
        ids: d.ids,
        target: d.move.target,
        delta: d.move.delta,
        new_track_id: d.newTrackId,
        force_new_track: d.move.force,
      });
    else if (d.side !== "move") {
      const item = g.items[0];
      const values = trimValues(
        d.clip,
        d.side,
        d.side === "left" ? item.start : item.start + item.duration,
        assets.find((a) => a.id === d.clip.asset_id),
        d.track.clips,
      );
      onEdit("trim_clip", {
        track_id: d.track.id,
        clip_id: d.clip.id,
        changes: {
          ...values,
          animations: retimeAnimations(d.clip, values.duration_ms),
          fade_in_ms: Math.min(d.clip.fade_in_ms, values.duration_ms),
          fade_out_ms: Math.min(d.clip.fade_out_ms, values.duration_ms),
        },
      });
    }
  };
  // Media dragged from the library, the preview monitor or the OS file system.
  const incoming = assets.find((a) => a.id === draggingAsset);
  const mediaIntent = (
    track: Track,
    start: number,
    asset: Asset,
    source: SourceSelection | null,
    newTrack = false,
  ): MediaInsert => ({
    asset_id: asset.id,
    track_id: track.id,
    start_ms: Math.round(start),
    placement: "exact",
    new_track: newTrack,
    mode: audioKinds.includes(track.kind)
      ? "audio"
      : source
        ? source.mode
        : undefined,
    ...(source
      ? {
          source_in_ms: source.source_in_ms,
          duration_ms: source.duration_ms,
          audio_track_id:
            source.audio_track_id === "new" ? undefined : source.audio_track_id,
        }
      : {}),
  });
  const accepts = (
    track: Track,
    asset: Asset,
    source: SourceSelection | null,
  ) =>
    source
      ? acceptsSource(track, asset, source) ||
        (source.mode === "both" && audioKinds.includes(track.kind))
      : acceptsAsset(track, asset);
  const mediaOver = (
    e: React.DragEvent<HTMLElement>,
    track: Track,
    newTrack = false,
  ) => {
    if (!incoming) return;
    e.preventDefault();
    e.stopPropagation();
    const valid = accepts(track, incoming, draggingSource);
    e.dataTransfer.dropEffect = valid ? "copy" : "none";
    const s = snapTime(
      position(e.clientX, e.currentTarget),
      edges(),
      8 / px,
      project.profile.fps,
      snap && !e.altKey,
    );
    const length = draggingSource?.duration_ms || incoming.duration_ms || 4000;
    if (!valid) {
      preview({
        items: [
          { track: track.id, start: s.value, duration: length, name: "" },
        ],
        valid: false,
        snap: null,
      });
      return;
    }
    try {
      const plan = planMediaInsert(
        project,
        assets,
        mediaIntent(track, s.value, incoming, draggingSource, newTrack),
      );
      preview({
        items: [
          {
            track: plan.newTrack ? "new" : plan.track_id,
            start: plan.start_ms,
            duration: plan.duration_ms,
            name: incoming.name,
          },
        ],
        valid: true,
        snap: s.snap,
        newTrack: plan.newTrack,
        note: ghostNote(plan, incoming.name),
      });
    } catch (error) {
      preview({
        items: [
          { track: track.id, start: s.value, duration: length, name: "" },
        ],
        valid: false,
        snap: null,
        note: (error as Error).message,
      });
    }
  };
  const mediaDrop = (
    e: React.DragEvent<HTMLElement>,
    track: Track,
    newTrack = false,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const done = () => {
      preview(null);
      set({ draggingAsset: null, draggingSource: null });
    };
    const asset = assets.find(
      (a) => a.id === e.dataTransfer.getData("application/synkinema-asset"),
    );
    const rawSource = e.dataTransfer.getData(sourceMime);
    let source: SourceSelection | null = null;
    if (rawSource) {
      try {
        source = JSON.parse(rawSource);
      } catch {
        return done();
      }
      if (!source || source.asset_id !== asset?.id) return done();
    }
    if (asset && accepts(track, asset, source)) {
      const snapped = snapTime(
        position(e.clientX, e.currentTarget),
        edges(),
        8 / px,
        project.profile.fps,
        snap && !e.altKey,
      );
      onEdit(
        "insert_media",
        mediaIntent(track, snapped.value, asset, source, newTrack),
      );
    }
    done();
  };
  const clipMove = (e: React.PointerEvent, c: Clip, t: Track) => {
    const d = gesture.current;
    if (!d || d.clip.id !== c.id) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3 && !d.moved) return;
    d.moved = true;
    autoScroll(e.clientX, e.clientY);
    const hit = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-track-id],[data-phantom-after]");
    const force = !!hit?.dataset.phantomAfter;
    const targetId = force ? hit!.dataset.phantomAfter : hit?.dataset.trackId;
    const delta =
      (e.clientX - d.x + (scroll.current?.scrollLeft || 0) - d.scroll) / px;
    const asset = assets.find((a) => a.id === c.asset_id);
    const requested =
      (d.side === "right" ? c.start_ms + c.duration_ms : c.start_ms) + delta;
    const snapped = snapTime(
      requested,
      edges(d.ids),
      8 / px,
      project.profile.fps,
      snap && !e.altKey,
    );
    if (d.side !== "move") {
      const v = trimValues(c, d.side, snapped.value, asset, t.clips);
      preview({
        items: [
          { track: t.id, start: v.start_ms, duration: v.duration_ms, name: "" },
        ],
        valid: true,
        snap: snapped.snap,
        note: c.name,
      });
      return;
    }
    let start = snapped.value;
    let guide = snapped.snap;
    const endSnap = snapTime(
      start + c.duration_ms,
      edges(d.ids),
      8 / px,
      project.profile.fps,
      snap && !e.altKey,
    );
    if (guide === null && endSnap.snap !== null) {
      start = Math.max(0, endSnap.value - c.duration_ms);
      guide = endSnap.snap;
    }
    const move = { target: targetId, delta: start - c.start_ms, force };
    const plan = planMove(project, assets, {
      anchor: c.id,
      ids: d.ids,
      target: move.target,
      delta: move.delta,
      newTrackId: d.newTrackId,
      forceNewTrack: force,
    });
    d.move = move;
    const anchor = plan.items[0];
    preview({
      items: plan.items.map((item) => ({
        track: item.to?.id ?? "new",
        start: item.start,
        duration: item.clip.duration_ms,
        name:
          item.clip.id === c.id && anchor?.extract
            ? tr("Extract audio · {{name}}", { name: c.name })
            : item.clip.name,
      })),
      valid: !!hit && plan.valid,
      snap: guide,
      newTrack: plan.newTrack,
      note:
        plan.items.length > 1
          ? tr("{{count}} clips · {{delta}}", {
              count: plan.items.length,
              delta: `${plan.delta >= 0 ? "+" : "−"}${tc(Math.abs(plan.delta))}`,
            })
          : ghostNote(plan, c.name),
    });
  };
  const marqueeMove = (e: React.PointerEvent) => {
    const m = marqueeRef.current,
      box = content.current?.getBoundingClientRect();
    if (!m || !box) return;
    const x1 = e.clientX - box.left,
      y1 = e.clientY - box.top;
    if (!m.moved && Math.hypot(x1 - m.x0, y1 - m.y0) < 4) return;
    autoScroll(e.clientX, e.clientY);
    const next = { ...m, x1, y1, moved: true };
    marqueeRef.current = next;
    setMarquee(next);
    const [top, bottom] = [Math.min(m.y0, y1), Math.max(m.y0, y1)];
    const lanes = [
      ...content.current!.querySelectorAll<HTMLElement>("[data-track-id]"),
    ].filter((lane) => {
      const r = lane.getBoundingClientRect();
      return r.bottom - box.top > top && r.top - box.top < bottom;
    });
    const ids = clipsInRange(
      project,
      lanes.map((lane) => lane.dataset.trackId!),
      (m.x0 - headerWidth) / px,
      (x1 - headerWidth) / px,
    );
    select([...new Set([...m.base, ...ids])]);
  };
  const phantom = (after?: string) => {
    if (!ghost?.newTrack || ghost.newTrack.after !== after) return null;
    const anchor = project.tracks.find((t) => t.id === after);
    return (
      <div className="timeline-row phantom-row" key="phantom">
        <div className="track-label phantom-label">
          <Plus size={14} />
          <span>
            {tr("New {{kind}} track", {
              kind: trackKindLabel(ghost.newTrack.kind).toLowerCase(),
            })}
          </span>
        </div>
        <div
          className="track-lane drop-target"
          data-phantom-after={after ?? ""}
          style={{ width }}
          onDragOver={(e) => anchor && mediaOver(e, anchor, true)}
          onDrop={(e) => anchor && mediaDrop(e, anchor, true)}
        >
          {ghost.items
            .filter((item) => item.track === "new")
            .map((item, i) => (
              <GhostClip key={i} item={item} valid={ghost.valid} px={px} />
            ))}
        </div>
      </div>
    );
  };
  return (
    <>
      <div className="timeline-help">
        <Button
          variant="ghost"
          className={`text-button ${snap ? "active" : ""}`}
          aria-pressed={snap}
          onClick={() => setSnap(!snap)}
        >
          <Magnet size={14} /> {snap ? tr("Snapping on") : tr("Snapping off")}
        </Button>
        <Button
          variant="ghost"
          className={`text-button ${linking ? "active" : ""}`}
          aria-pressed={linking}
          title={tr("Move a video and its sound together")}
          onClick={() => set({ linking: !linking })}
        >
          {linking ? <Link2 size={14} /> : <Unlink2 size={14} />}{" "}
          {linking ? tr("Linked selection") : tr("Unlinked")}
        </Button>
        <span>
          {tr(
            "Drag clips or edges · Shift/⌘-click or drag on empty lanes to select many · Alt: no snapping",
          )}
        </span>
        <output aria-live="polite">
          {ghost
            ? ghost.valid
              ? `${tc(ghost.items[0].start)} → ${tc(ghost.items[0].start + ghost.items[0].duration)}${ghost.note ? ` · ${ghost.note}` : ""}`
              : ghost.note || tr("This clip is not compatible with this track")
            : selectedIds.length > 1
              ? tr("{{count}} clips selected", { count: selectedIds.length })
              : ""}
        </output>
      </div>
      <TimelineSelectionTools
        clip={selectedClip}
        track={selectedTrack}
        onEdit={onEdit}
      />
      <div
        className="timeline-scroll"
        ref={scroll}
        tabIndex={-1}
        onPointerDown={(e) => {
          if (
            !(e.target as Element).closest(
              'button,input,select,.track-label,[role="slider"],.track-lane',
            )
          )
            set({ selectedId: null });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) preview(null);
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input, select")) return;
          if (e.key === "Escape") {
            if (gesture.current || marqueeRef.current) {
              cancel();
              marqueeRef.current = null;
              setMarquee(null);
            } else set({ selectedId: null });
            e.stopPropagation();
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
            e.preventDefault();
            select(project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
          }
        }}
      >
        <div
          className="timeline-content"
          ref={content}
          style={{ width: width + headerWidth }}
        >
          <div className="ruler">
            <div className="ruler-label">{project.profile.fps} FPS</div>
            <div
              className="ruler-line"
              style={{ width }}
              role="slider"
              aria-label={tr("Timeline playhead")}
              aria-valuemin={0}
              aria-valuemax={project.duration_ms}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  set({
                    time: Math.max(
                      0,
                      Math.min(
                        project.duration_ms - 1,
                        useStudio.getState().time +
                          ((e.key === "ArrowRight" ? 1 : -1) * 1000) /
                            project.profile.fps,
                      ),
                    ),
                    playing: false,
                  });
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                seek(e.clientX, e.currentTarget);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  seek(e.clientX, e.currentTarget);
              }}
            >
              {Array.from(
                { length: Math.ceil(duration / (zoom < 1 ? 5000 : 2000)) },
                (_, i) => {
                  const t = i * (zoom < 1 ? 5000 : 2000);
                  return (
                    <span key={i} style={{ left: t * px }}>
                      {tc(t)}
                    </span>
                  );
                },
              )}
            </div>
          </div>
          <TrackSorting tracks={project.tracks} onEdit={onEdit}>
            {project.tracks.map((t, index) => {
              const visual = ["video", "overlay", "text"].includes(t.kind);
              const Icon =
                t.kind === "text"
                  ? Type
                  : ["video", "overlay"].includes(t.kind)
                    ? Film
                    : Music2;
              return (
                <Fragment key={t.id}>
                  <SortableTrack
                    track={t}
                    index={index}
                    className={`timeline-row ${visual ? "" : "audio-track-row"} ${t.muted ? "muted-track" : ""}`}
                  >
                    <div className="track-label">
                      <TrackHandle name={t.name} />
                      <Icon size={16} />
                      <span title={t.name}>{t.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="icon-button"
                        aria-label={
                          visual
                            ? t.muted
                              ? tr("Show {{name}}", { name: t.name })
                              : tr("Hide {{name}}", { name: t.name })
                            : t.muted
                              ? tr("Unmute {{name}}", { name: t.name })
                              : tr("Mute {{name}}", { name: t.name })
                        }
                        onClick={() =>
                          onEdit("update_track", {
                            track_id: t.id,
                            changes: { muted: !t.muted },
                          })
                        }
                      >
                        {visual ? (
                          t.muted ? (
                            <EyeOff size={13} />
                          ) : (
                            <Eye size={13} />
                          )
                        ) : t.muted ? (
                          <VolumeX size={13} />
                        ) : (
                          <Volume2 size={13} />
                        )}
                      </Button>
                      <TimelineTrackMenu
                        track={t}
                        project={project}
                        onEdit={onEdit}
                      />
                      {!visual && <TrackGain track={t} onEdit={onEdit} />}
                    </div>
                    <div
                      className={`track-lane ${incoming ? (accepts(t, incoming, draggingSource) ? "drop-compatible" : "drop-incompatible") : ""} ${ghost?.items.some((item) => item.track === t.id) ? "drop-target" : ""}`}
                      data-track-id={t.id}
                      data-track-kind={t.kind}
                      style={{ width }}
                      onPointerDown={(e) => {
                        if (e.target !== e.currentTarget || e.button !== 0)
                          return;
                        const box = content.current!.getBoundingClientRect();
                        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                        marqueeRef.current = {
                          x0: e.clientX - box.left,
                          y0: e.clientY - box.top,
                          x1: e.clientX - box.left,
                          y1: e.clientY - box.top,
                          base: additive
                            ? useStudio.getState().selectedIds
                            : [],
                          moved: false,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={marqueeMove}
                      onPointerUp={(e) => {
                        const m = marqueeRef.current;
                        marqueeRef.current = null;
                        setMarquee(null);
                        if (m && !m.moved) {
                          seek(e.clientX, e.currentTarget);
                          if (!m.base.length) set({ selectedId: null });
                        }
                      }}
                      onPointerCancel={() => {
                        marqueeRef.current = null;
                        setMarquee(null);
                      }}
                      onDragOver={(e) => mediaOver(e, t)}
                      onDrop={(e) => mediaDrop(e, t)}
                    >
                      {t.clips.map((c) => {
                        const asset = assets.find((a) => a.id === c.asset_id),
                          moving =
                            !!ghost &&
                            !!gesture.current?.moved &&
                            (gesture.current.side === "move"
                              ? gesture.current.ids.includes(c.id)
                              : gesture.current.clip.id === c.id);
                        return (
                          <Fragment key={c.id}>
                            <button
                              aria-label={tr("Clip {{name}}", { name: c.name })}
                              aria-pressed={chosen.has(c.id)}
                              data-clip-id={c.id}
                              className={`timeline-clip clip-${t.kind} ${chosen.has(c.id) ? "selected" : ""} ${selected === c.id && chosen.size > 1 ? "primary" : ""} ${linked.has(c.id) ? "linked" : ""} ${moving ? "drag-origin" : ""}`}
                              style={{
                                left: c.start_ms * px,
                                width: Math.max(12, c.duration_ms * px - 2),
                              }}
                              title={`${c.name} · ${tc(c.start_ms)} · ${tc(c.duration_ms)}`}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "ArrowLeft" ||
                                  e.key === "ArrowRight"
                                ) {
                                  e.preventDefault();
                                  const s = useStudio.getState();
                                  onEdit("move_clips", {
                                    anchor: c.id,
                                    ids: withLinked(
                                      project,
                                      s.selectedIds.includes(c.id)
                                        ? s.selectedIds
                                        : [c.id],
                                      s.linking,
                                    ),
                                    delta:
                                      (e.key === "ArrowRight" ? 1 : -1) *
                                      (e.shiftKey
                                        ? 1000
                                        : 1000 / project.profile.fps),
                                  });
                                }
                              }}
                              onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                e.stopPropagation();
                                const side = (e.target as HTMLElement).dataset
                                  .trim as "left" | "right" | undefined;
                                const s = useStudio.getState();
                                const additive =
                                  e.shiftKey || e.metaKey || e.ctrlKey;
                                let ids = s.selectedIds;
                                if (additive && !side) {
                                  if (ids.includes(c.id)) {
                                    select(ids.filter((id) => id !== c.id));
                                    return;
                                  }
                                  ids = [...ids, c.id];
                                } else if (side || !ids.includes(c.id))
                                  ids = [c.id];
                                select(ids, c.id);
                                gesture.current = {
                                  clip: c,
                                  track: t,
                                  side: side || "move",
                                  x: e.clientX,
                                  y: e.clientY,
                                  scroll: scroll.current?.scrollLeft || 0,
                                  moved: false,
                                  ids: side
                                    ? [c.id]
                                    : withLinked(project, ids, s.linking),
                                  collapse:
                                    !additive && !side && ids.length > 1,
                                  newTrackId: createId(),
                                };
                                e.currentTarget.setPointerCapture(e.pointerId);
                              }}
                              onPointerMove={(e) => clipMove(e, c, t)}
                              onPointerUp={finish}
                              onPointerCancel={cancel}
                            >
                              <span
                                className="clip-handle"
                                data-trim="left"
                                title={tr("Trim start")}
                              />
                              {asset?.thumbnail_url && (
                                <img
                                  src={asset.thumbnail_url}
                                  alt=""
                                  draggable={false}
                                />
                              )}
                              <span className="clip-name">
                                {pairs.has(c.id) && (
                                  <Link2
                                    size={10}
                                    className="clip-link"
                                    aria-label={tr("Linked")}
                                  />
                                )}
                                {t.kind === "text" ? c.text : c.name}
                                <small>{tc(c.duration_ms)}</small>
                              </span>
                              {c.transition.type !== "cut" && (
                                <span className="transition-indicator">◇</span>
                              )}
                              <span
                                className="clip-handle right"
                                data-trim="right"
                                title={tr("Trim end")}
                              />
                            </button>
                            {!visual && (
                              <AudioEnvelope
                                clip={c}
                                track={t}
                                width={Math.max(12, c.duration_ms * px - 2)}
                                left={c.start_ms * px}
                                onEdit={onEdit}
                              />
                            )}
                          </Fragment>
                        );
                      })}
                      {ghost?.items
                        .filter((item) => item.track === t.id)
                        .map((item, i) => (
                          <GhostClip
                            key={i}
                            item={item}
                            valid={ghost.valid}
                            px={px}
                          />
                        ))}
                    </div>
                  </SortableTrack>
                  {phantom(t.id)}
                </Fragment>
              );
            })}
            {phantom(undefined)}
          </TrackSorting>
          <Playhead px={px} />
          {ghost?.snap !== null && ghost?.snap !== undefined && (
            <div
              className="snap-guide"
              style={{ left: headerWidth + ghost.snap * px }}
            />
          )}
          {marquee?.moved && (
            <div
              className="timeline-marquee"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}
          {reviews
            .filter((r) => !r.resolved)
            .map((r) => (
              <span
                className="review-marker"
                key={r.id}
                title={r.message}
                style={{ left: headerWidth + r.time_ms * px }}
              >
                ◆
              </span>
            ))}
        </div>
      </div>
    </>
  );
}
function GhostClip({
  item,
  valid,
  px,
}: {
  item: GhostItem;
  valid: boolean;
  px: number;
}) {
  return (
    <div
      className={`clip-ghost ${valid ? "" : "invalid"}`}
      style={{
        left: item.start * px,
        width: Math.max(12, item.duration * px - 2),
      }}
    >
      {item.name}
      <small>{tc(item.duration)}</small>
    </div>
  );
}
function Playhead({ px }: { px: number }) {
  const time = useStudio((s) => s.time);
  return (
    <div className="playhead" style={{ left: headerWidth + time * px }}>
      <span />
    </div>
  );
}
