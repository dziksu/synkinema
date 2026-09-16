import { Button } from "@/components/ui/button";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset, Clip, Project, Review, Track } from "@/lib/types";
import {
  acceptsSource,
  sourceMime,
  sourceStart,
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
  acceptsAsset,
  acceptsClip,
  defaultAssetGain,
  extractsAudio,
  freeStart,
  retimeAnimations,
  snapTime,
  trimValues,
} from "@/modules/editor/timeline/timelineMath";
import TimelineTrackMenu from "@/modules/editor/timeline/TimelineTrackMenu";
import {
  Eye,
  EyeOff,
  Film,
  Magnet,
  Music2,
  Type,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { SortableTrack, TrackHandle, TrackSorting } from "./track-sorting";
const tc = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const headerWidth = 220;
type Ghost = {
  track: string;
  start: number;
  duration: number;
  valid: boolean;
  snap: number | null;
  name: string;
};
type Gesture = {
  clip: Clip;
  track: Track;
  side: "move" | "left" | "right";
  x: number;
  y: number;
  scroll: number;
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
    draggingAsset = useStudio((s) => s.draggingAsset),
    draggingSource = useStudio((s) => s.draggingSource),
    set = useStudio((s) => s.set);
  const scroll = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    ghostRef = useRef<Ghost | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null),
    [snap, setSnap] = useState(true);
  const selectedTrack = project.tracks.find((t) =>
    t.clips.some((c) => c.id === selected),
  );
  const selectedClip = selectedTrack?.clips.find((c) => c.id === selected);
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
  const edges = (id?: string) => [
    0,
    useStudio.getState().time,
    ...project.tracks.flatMap((t) =>
      t.clips
        .filter((c) => c.id !== id)
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
  const cancel = () => {
    gesture.current = null;
    preview(null);
  };
  const finish = () => {
    const d = gesture.current,
      g = ghostRef.current;
    cancel();
    if (!d || !g || !d.moved || !g.valid) return;
    const target = project.tracks.find((t) => t.id === g.track)!;
    if (
      d.side === "move" &&
      extractsAudio(
        target,
        d.track,
        assets.find((a) => a.id === d.clip.asset_id),
      )
    ) {
      onEdit("add_clip", {
        track_id: target.id,
        clip: {
          asset_id: d.clip.asset_id,
          name: tr("Audio · {{name}}", { name: d.clip.name }),
          start_ms: g.start,
          duration_ms: d.clip.duration_ms,
          source_in_ms: d.clip.source_in_ms,
          speed: d.clip.speed,
          gain_db: d.clip.gain_db,
          fade_in_ms: d.clip.fade_in_ms,
          fade_out_ms: d.clip.fade_out_ms,
        },
      });
    } else if (d.side === "move")
      onEdit("move_clip", {
        track_id: d.track.id,
        clip_id: d.clip.id,
        target_track_id: g.track,
        start_ms: g.start,
      });
    else {
      const values = trimValues(
        d.clip,
        d.side,
        d.side === "left" ? g.start : g.start + g.duration,
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
        <span>
          {" "}
          {tr(
            "Drag a clip or its edge · Alt: disable snapping · Esc: cancel",
          )}{" "}
        </span>
        <output aria-live="polite">
          {ghost
            ? `${ghost.valid ? tc(ghost.start) + " → " + tc(ghost.start + ghost.duration) : tr("This clip is not compatible with this track")}`
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
        onPointerDown={(e) => {
          if (
            !(e.target as Element).closest(
              'button,input,select,.track-label,[role="slider"]',
            )
          )
            set({ selectedId: null });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancel();
            e.stopPropagation();
          }
        }}
      >
        <div
          className="timeline-content"
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
              const incoming = assets.find((a) => a.id === draggingAsset);
              return (
                <SortableTrack
                  track={t}
                  index={index}
                  className={`timeline-row ${visual ? "" : "audio-track-row"} ${t.muted ? "muted-track" : ""}`}
                  key={t.id}
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
                    className={`track-lane ${incoming ? ((draggingSource ? acceptsSource(t, incoming, draggingSource) : acceptsAsset(t, incoming)) ? "drop-compatible" : "drop-incompatible") : ""} ${ghost?.track === t.id ? "drop-target" : ""}`}
                    data-track-id={t.id}
                    data-track-kind={t.kind}
                    style={{ width }}
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget) {
                        seek(e.clientX, e.currentTarget);
                        set({ selectedId: null });
                      }
                    }}
                    onDragOver={(e) => {
                      if (!incoming) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const valid = draggingSource
                        ? acceptsSource(t, incoming, draggingSource)
                        : acceptsAsset(t, incoming);
                      e.dataTransfer.dropEffect = valid ? "copy" : "none";
                      const s = snapTime(
                        position(e.clientX, e.currentTarget),
                        edges(),
                        8 / px,
                        project.profile.fps,
                        snap && !e.altKey,
                      );
                      preview({
                        track: t.id,
                        start: draggingSource
                          ? sourceStart(t, s.value, draggingSource.duration_ms)
                          : freeStart(t, s.value, incoming.duration_ms || 4000),
                        duration:
                          draggingSource?.duration_ms ||
                          incoming.duration_ms ||
                          4000,
                        valid,
                        snap: s.snap,
                        name: incoming.name,
                      });
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        preview(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const asset = assets.find(
                        (a) =>
                          a.id ===
                          e.dataTransfer.getData("application/synkinema-asset"),
                      );
                      const rawSource = e.dataTransfer.getData(sourceMime);
                      let source: SourceSelection | null = null;
                      if (rawSource) {
                        try {
                          source = JSON.parse(rawSource);
                        } catch {
                          preview(null);
                          set({ draggingAsset: null, draggingSource: null });
                          return;
                        }
                        if (!source || source.asset_id !== asset?.id) {
                          preview(null);
                          set({ draggingAsset: null, draggingSource: null });
                          return;
                        }
                      }
                      if (
                        asset &&
                        (source
                          ? acceptsSource(t, asset, source)
                          : acceptsAsset(t, asset))
                      ) {
                        const snapped = snapTime(
                          position(e.clientX, e.currentTarget),
                          edges(),
                          8 / px,
                          project.profile.fps,
                          snap && !e.altKey,
                        );
                        const start = freeStart(
                          t,
                          snapped.value,
                          source?.duration_ms || asset.duration_ms || 4000,
                        );
                        if (source)
                          onEdit("insert_source", {
                            ...source,
                            track_id: t.id,
                            start_ms: Math.round(snapped.value),
                          });
                        else
                          onEdit("add_clip", {
                            track_id: t.id,
                            clip: {
                              asset_id: asset.id,
                              name: asset.name,
                              duration_ms: asset.duration_ms || 4000,
                              gain_db: defaultAssetGain(asset),
                              start_ms: Math.round(start),
                            },
                          });
                      }
                      preview(null);
                      set({ draggingAsset: null, draggingSource: null });
                    }}
                  >
                    {t.clips.map((c) => {
                      const asset = assets.find((a) => a.id === c.asset_id),
                        active = gesture.current?.clip.id === c.id;
                      return (
                        <Fragment key={c.id}>
                          <button
                            aria-label={tr("Clip {{name}}", { name: c.name })}
                            data-clip-id={c.id}
                            className={`timeline-clip clip-${t.kind} ${selected === c.id ? "selected" : ""} ${active && ghost ? "drag-origin" : ""}`}
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
                                onEdit("move_clip", {
                                  track_id: t.id,
                                  clip_id: c.id,
                                  start_ms: freeStart(
                                    t,
                                    c.start_ms +
                                      (e.key === "ArrowRight" ? 1 : -1) *
                                        (e.shiftKey
                                          ? 1000
                                          : 1000 / project.profile.fps),
                                    c.duration_ms,
                                    c.id,
                                  ),
                                });
                              }
                            }}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              const side = (e.target as HTMLElement).dataset
                                .trim as "left" | "right" | undefined;
                              set({ selectedId: c.id, playing: false });
                              gesture.current = {
                                clip: c,
                                track: t,
                                side: side || "move",
                                x: e.clientX,
                                y: e.clientY,
                                scroll: scroll.current?.scrollLeft || 0,
                                moved: false,
                              };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              const d = gesture.current;
                              if (!d || d.clip.id !== c.id) return;
                              if (
                                Math.hypot(e.clientX - d.x, e.clientY - d.y) <
                                  3 &&
                                !d.moved
                              )
                                return;
                              d.moved = true;
                              const container = scroll.current;
                              if (container) {
                                const rect = container.getBoundingClientRect();
                                if (e.clientX > rect.right - 32)
                                  container.scrollLeft += 14;
                                else if (e.clientX < rect.left + 180)
                                  container.scrollLeft -= 14;
                                if (e.clientY > rect.bottom - 24)
                                  container.scrollTop += 10;
                                else if (e.clientY < rect.top + 42)
                                  container.scrollTop -= 10;
                              }
                              const lane = document
                                .elementFromPoint(e.clientX, e.clientY)
                                ?.closest<HTMLElement>("[data-track-id]");
                              const target =
                                project.tracks.find(
                                  (x) => x.id === lane?.dataset.trackId,
                                ) || t;
                              const delta =
                                (e.clientX -
                                  d.x +
                                  (scroll.current?.scrollLeft || 0) -
                                  d.scroll) /
                                px;
                              const requested =
                                (d.side === "right"
                                  ? c.start_ms + c.duration_ms
                                  : c.start_ms) + delta;
                              const snapped = snapTime(
                                requested,
                                edges(c.id),
                                8 / px,
                                project.profile.fps,
                                snap && !e.altKey,
                              );
                              if (d.side === "move") {
                                let start = snapped.value;
                                let guide = snapped.snap;
                                const endSnap = snapTime(
                                  start + c.duration_ms,
                                  edges(c.id),
                                  8 / px,
                                  project.profile.fps,
                                  snap && !e.altKey,
                                );
                                if (guide === null && endSnap.snap !== null) {
                                  start = Math.max(
                                    0,
                                    endSnap.value - c.duration_ms,
                                  );
                                  guide = endSnap.snap;
                                }
                                start = freeStart(
                                  target,
                                  start,
                                  c.duration_ms,
                                  c.id,
                                );
                                preview({
                                  track: target.id,
                                  start,
                                  duration: c.duration_ms,
                                  valid:
                                    !!lane && acceptsClip(target, t, asset, c),
                                  snap: guide,
                                  name: extractsAudio(target, t, asset)
                                    ? tr("Extract audio · {{name}}", {
                                        name: c.name,
                                      })
                                    : c.name,
                                });
                              } else {
                                const v = trimValues(
                                  c,
                                  d.side,
                                  snapped.value,
                                  asset,
                                  t.clips,
                                );
                                preview({
                                  track: t.id,
                                  start: v.start_ms,
                                  duration: v.duration_ms,
                                  valid: true,
                                  snap: snapped.snap,
                                  name: c.name,
                                });
                              }
                            }}
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
                    {ghost?.track === t.id && (
                      <div
                        className={`clip-ghost ${ghost.valid ? "" : "invalid"}`}
                        style={{
                          left: ghost.start * px,
                          width: Math.max(12, ghost.duration * px - 2),
                        }}
                      >
                        {ghost.name}
                        <small>{tc(ghost.duration)}</small>
                      </div>
                    )}
                  </div>
                </SortableTrack>
              );
            })}
          </TrackSorting>
          <Playhead px={px} />
          {ghost?.snap !== null && ghost?.snap !== undefined && (
            <div
              className="snap-guide"
              style={{ left: headerWidth + ghost.snap * px }}
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
function Playhead({ px }: { px: number }) {
  const time = useStudio((s) => s.time);
  return (
    <div className="playhead" style={{ left: headerWidth + time * px }}>
      <span />
    </div>
  );
}
