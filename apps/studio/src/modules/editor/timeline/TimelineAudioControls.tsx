import NumberField from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import type { Clip, Track } from "@/lib/types";
import { useStudio, type AudioDraft } from "@/modules/editor/store";
import {
  gainAnimation,
  putGainPoint,
  valueAt,
} from "@/modules/editor/timeline/timelineAudio";
import { Copy, DiamondPlus, RotateCcw, Scissors, Trash2 } from "lucide-react";
import { useRef } from "react";

export type TimelineEdit = (
  type: string,
  payload: unknown,
) => void | Promise<void>;

export function TimelineSelectionTools({
  clip,
  track,
  onEdit,
}: {
  clip?: Clip;
  track?: Track;
  onEdit: TimelineEdit;
}) {
  const time = useStudio((s) => s.time);
  const audio =
    track && ["voiceover", "music", "sound", "ambient"].includes(track.kind);
  return (
    <div className="timeline-selection-panel">
      {clip && track ? (
        <>
          <div className="timeline-selection-tools">
            <span className="timeline-selection-name" title={clip.name}>
              {clip.name}
            </span>
            <Button
              variant="ghost"
              className="text-button"
              disabled={
                time - clip.start_ms < 100 ||
                clip.start_ms + clip.duration_ms - time < 100
              }
              onClick={() =>
                onEdit("split_clip", {
                  track_id: track.id,
                  clip_id: clip.id,
                  time_ms: Math.round(time),
                })
              }
            >
              <Scissors size={14} />
              {tr("Split at playhead")}
            </Button>
            <Button
              variant="ghost"
              className="text-button"
              onClick={() =>
                onEdit("duplicate_clip", {
                  track_id: track.id,
                  clip_id: clip.id,
                })
              }
            >
              <Copy size={14} />
              {tr("Duplicate clip")}
            </Button>
            <Button
              variant="destructive"
              className="text-button danger-text"
              onClick={() =>
                onEdit("remove_clip", { track_id: track.id, clip_id: clip.id })
              }
            >
              <Trash2 size={14} />
              {tr("Delete clip")}
            </Button>
          </div>
          {audio ? (
            <ClipAudioControls clip={clip} track={track} onEdit={onEdit} />
          ) : (
            <p className="timeline-selection-hint">
              {tr(
                "Drag edges to trim · Delete removes the selected clip · Undo restores edits",
              )}
            </p>
          )}
        </>
      ) : (
        <p className="timeline-selection-hint">
          {tr(
            "Select a clip for quick edits. Audio clips include volume points and fades.",
          )}
        </p>
      )}
    </div>
  );
}

const releasedDrafts = new WeakSet<AudioDraft>();
function releaseDraft(draft: AudioDraft, edit: TimelineEdit) {
  if (releasedDrafts.has(draft)) return;
  releasedDrafts.add(draft);
  const clear = () => {
    if (useStudio.getState().audioDraft === draft)
      useStudio.setState({ audioDraft: null });
  };
  const changes = {
    ...(draft.gain_db !== undefined ? { gain_db: draft.gain_db } : {}),
    ...(draft.animations ? { animations: draft.animations } : {}),
  };
  try {
    const pending = edit(draft.clipId ? "update_clip" : "update_track", {
      track_id: draft.trackId,
      ...(draft.clipId ? { clip_id: draft.clipId } : {}),
      changes,
    });
    if (pending) void pending.then(clear, clear);
    else clear();
  } catch (error) {
    clear();
    throw error;
  }
}

export function TrackGain({
  track,
  onEdit,
}: {
  track: Track;
  onEdit: TimelineEdit;
}) {
  const draft = useStudio((s) => s.audioDraft);
  const own = draft?.trackId === track.id && !draft.clipId ? draft : null;
  const value = own?.gain_db ?? track.gain_db ?? 0;
  const release = () => {
    const current = useStudio.getState().audioDraft;
    if (current?.trackId === track.id && !current.clipId)
      releaseDraft(current, onEdit);
  };
  return (
    <label
      className="track-gain"
      title={tr("Track volume — applies to every clip")}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") useStudio.setState({ audioDraft: null });
      }}
    >
      <input
        type="range"
        min={-60}
        max={12}
        step={0.5}
        value={value}
        aria-label={tr("Volume for {{name}}", { name: track.name })}
        aria-valuetext={`${value} dB`}
        onChange={(e) =>
          useStudio.setState({
            audioDraft: { trackId: track.id, gain_db: Number(e.target.value) },
          })
        }
        onPointerUp={release}
        onKeyUp={(e) => {
          if (e.key !== "Escape") release();
        }}
        onBlur={release}
        onPointerCancel={() => useStudio.setState({ audioDraft: null })}
      />
      <span
        className="track-gain-value"
        aria-hidden="true"
      >{`${value > 0 ? "+" : ""}${value} dB`}</span>
    </label>
  );
}

export function ClipAudioControls({
  clip,
  track,
  onEdit,
}: {
  clip: Clip;
  track: Track;
  onEdit: TimelineEdit;
}) {
  const time = useStudio((s) => s.time);
  const keys =
    clip.animations.find((a) => a.property === "gain_db")?.keyframes || [];
  const local = Math.round(time - clip.start_ms);
  const inside = local >= 0 && local <= clip.duration_ms;
  const change = (changes: Partial<Clip>) =>
    onEdit("update_clip", { track_id: track.id, clip_id: clip.id, changes });
  return (
    <div
      className="timeline-audio-tools"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <NumberField
        label={keys.length ? tr("Volume at playhead") : tr("Clip volume")}
        value={Number(valueAt(clip, "gain_db", time, clip.gain_db).toFixed(1))}
        min={-60}
        max={12}
        step={0.5}
        suffix="dB"
        onChange={(gain_db) =>
          change(
            keys.length
              ? {
                  animations: putGainPoint(
                    clip,
                    Math.max(0, Math.min(clip.duration_ms, local)),
                    gain_db,
                  ),
                }
              : { gain_db },
          )
        }
      />
      <NumberField
        label={tr("Fade in")}
        value={clip.fade_in_ms}
        min={0}
        max={Math.min(10000, clip.duration_ms)}
        step={50}
        suffix="ms"
        onChange={(fade_in_ms) => change({ fade_in_ms })}
      />
      <NumberField
        label={tr("Fade out")}
        value={clip.fade_out_ms}
        min={0}
        max={Math.min(10000, clip.duration_ms)}
        step={50}
        suffix="ms"
        onChange={(fade_out_ms) => change({ fade_out_ms })}
      />
      <Button
        variant="ghost"
        className="text-button"
        disabled={!inside || keys.length >= 64}
        onClick={() =>
          change({
            animations: putGainPoint(
              clip,
              local,
              valueAt(clip, "gain_db", time, clip.gain_db),
            ),
          })
        }
      >
        <DiamondPlus size={15} />
        {tr("Add volume point")}
      </Button>
      <Button
        variant="ghost"
        className="text-button"
        disabled={!keys.length}
        onClick={() =>
          change({
            gain_db: Number(
              valueAt(clip, "gain_db", time, clip.gain_db).toFixed(1),
            ),
            animations: gainAnimation(clip, []),
          })
        }
      >
        <RotateCcw size={14} />
        {tr("Clear volume points")}
      </Button>
    </div>
  );
}

export function AudioEnvelope({
  clip,
  track,
  width,
  left,
  onEdit,
}: {
  clip: Clip;
  track: Track;
  width: number;
  left: number;
  onEdit: TimelineEdit;
}) {
  const draft = useStudio((s) => s.audioDraft);
  const current = draft?.clipId === clip.id ? { ...clip, ...draft } : clip;
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ point: number | null; base: Clip } | null>(null);
  const keys =
    current.animations.find((a) => a.property === "gain_db")?.keyframes || [];
  const x = (time: number) =>
    5 + (time / clip.duration_ms) * Math.max(1, width - 10);
  const y = (gain: number) => 4 + ((12 - gain) / 72) * 32;
  const pointAt = (clientX: number, clientY: number) => {
    const bounds = svg.current!.getBoundingClientRect();
    return {
      time: Math.max(
        0,
        Math.min(
          clip.duration_ms,
          Math.round(
            ((clientX - bounds.left - 5) / Math.max(1, width - 10)) *
              clip.duration_ms,
          ),
        ),
      ),
      gain: Math.max(
        -60,
        Math.min(
          12,
          Math.round((12 - ((clientY - bounds.top - 4) / 32) * 72) * 2) / 2,
        ),
      ),
    };
  };
  const save = (changes: Partial<Clip>) =>
    onEdit("update_clip", { track_id: track.id, clip_id: clip.id, changes });
  const update = (changes: Pick<AudioDraft, "gain_db" | "animations">) =>
    useStudio.setState({
      audioDraft: { trackId: track.id, clipId: clip.id, ...changes },
    });
  const remove = (index: number) =>
    save({
      animations: gainAnimation(
        clip,
        keys.filter((_, i) => i !== index),
      ),
    });
  const shape = keys.length
    ? [
        [0, y(keys[0].value)],
        ...[
          ...new Set([
            ...keys.map((p) => p.time_ms),
            ...Array.from(
              { length: 65 },
              (_, i) => (clip.duration_ms * i) / 64,
            ),
          ]),
        ]
          .sort((a, b) => a - b)
          .map((time) => [
            x(time),
            y(
              valueAt(
                current,
                "gain_db",
                clip.start_ms + time,
                current.gain_db,
              ),
            ),
          ]),
        [width, y(keys.at(-1)!.value)],
      ]
    : [
        [0, y(current.gain_db)],
        [width, y(current.gain_db)],
      ];
  return (
    <svg
      ref={svg}
      className="audio-envelope"
      width={width}
      height={40}
      style={{ left }}
      aria-label={tr("Volume envelope for {{name}}", { name: clip.name })}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        useStudio.getState().set({ selectedId: clip.id });
        const target = e.target as Element;
        const index = target.getAttribute("data-point");
        if (e.altKey && index === null) {
          const p = pointAt(e.clientX, e.clientY);
          void save({ animations: putGainPoint(clip, p.time, p.gain) });
          return;
        }
        if (index === null && keys.length) return;
        gesture.current = {
          point: index === null ? null : Number(index),
          base: current,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const active = gesture.current;
        if (!active) return;
        e.stopPropagation();
        const p = pointAt(e.clientX, e.clientY);
        if (active.point === null) update({ gain_db: p.gain });
        else {
          const points = active.base.animations.find(
            (a) => a.property === "gain_db",
          )!.keyframes;
          const i = active.point;
          const time_ms = Math.max(
            i ? points[i - 1].time_ms + 1 : 0,
            Math.min(
              i < points.length - 1
                ? points[i + 1].time_ms - 1
                : clip.duration_ms,
              p.time,
            ),
          );
          update({
            animations: gainAnimation(
              active.base,
              points.map((point, index) =>
                index === i ? { ...point, time_ms, value: p.gain } : point,
              ),
            ),
          });
        }
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        gesture.current = null;
        const currentDraft = useStudio.getState().audioDraft;
        if (currentDraft?.clipId === clip.id)
          releaseDraft(currentDraft, onEdit);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        useStudio.setState({ audioDraft: null });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          gesture.current = null;
          useStudio.setState({ audioDraft: null });
        }
      }}
    >
      <title>
        {tr(
          "Drag the line to change volume · Alt-click to add a point · Right-click a point to remove",
        )}
      </title>
      <polyline
        className="envelope-hit"
        points={shape.map((p) => p.join(",")).join(" ")}
      />
      <polyline
        className="envelope-line"
        points={shape.map((p) => p.join(",")).join(" ")}
      />
      {keys.map((point, i) => (
        <circle
          key={i}
          data-point={i}
          cx={x(point.time_ms)}
          cy={y(point.value)}
          r={4}
          tabIndex={0}
          role="slider"
          aria-label={tr("Volume point {{number}}", { number: i + 1 })}
          aria-valuemin={-60}
          aria-valuemax={12}
          aria-valuenow={point.value}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void remove(i);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              gesture.current = null;
              useStudio.setState({ audioDraft: null });
            }
            if (["Delete", "Backspace"].includes(e.key)) {
              e.preventDefault();
              void remove(i);
            }
            if (["ArrowUp", "ArrowDown"].includes(e.key)) {
              e.preventDefault();
              void save({
                animations: gainAnimation(
                  clip,
                  keys.map((p, index) =>
                    index === i
                      ? {
                          ...p,
                          value: Math.max(
                            -60,
                            Math.min(
                              12,
                              p.value + (e.key === "ArrowUp" ? 1 : -1),
                            ),
                          ),
                        }
                      : p,
                  ),
                ),
              });
            }
          }}
        >
          <title>{`${(point.time_ms / 1000).toFixed(2)} s · ${point.value} dB`}</title>
        </circle>
      ))}
    </svg>
  );
}
