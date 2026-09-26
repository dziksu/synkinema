import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset } from "@/lib/types";
import {
  sourceMime,
  type SourceSelection,
} from "@/modules/editor/source/sourceInsert";
import { useStudio } from "@/modules/editor/store";
import {
  defaultMode,
  type MediaInsert,
} from "@/modules/editor/timeline/timelineEditing";
import { ArrowDownToLine, GripVertical, Pause, Play, X } from "lucide-react";
import { useRef, useState } from "react";

export type MonitorInsert = Pick<
  MediaInsert,
  "asset_id" | "source_in_ms" | "duration_ms" | "mode"
>;

/**
 * Preview monitor for one media item. Plays immediately, marks an optional
 * In/Out range (I/O keys) and inserts or drags the range onto the timeline.
 */
export default function SourceMonitor({
  asset,
  fps,
  busy,
  onClose,
  onInsert,
}: {
  asset: Asset;
  fps: number;
  busy: boolean;
  onClose: () => void;
  onInsert: (intent: MonitorInsert) => void;
}) {
  useLocale();
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const image = asset.kind === "image";
  const duration = asset.duration_ms || 0;
  const [pointIn, setIn] = useState(0),
    [pointOut, setOut] = useState(duration);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(image),
    [error, setError] = useState("");
  const [mode, setMode] = useState(defaultMode(asset));
  const ranged = !image && (pointIn > 0 || pointOut < duration);
  // Carry the range/stream choice while dragging only when it differs from a plain file drop.
  const custom = !image && (ranged || mode !== defaultMode(asset));
  const selection: SourceSelection = {
    asset_id: asset.id,
    source_in_ms: pointIn,
    duration_ms: image ? duration || 4000 : pointOut - pointIn,
    mode,
  };
  const intent: MonitorInsert = ranged
    ? {
        asset_id: asset.id,
        source_in_ms: pointIn,
        duration_ms: pointOut - pointIn,
        mode,
      }
    : { asset_id: asset.id, mode };
  const valid = ready && !busy && !error && (image || duration >= 100);
  const seek = (ms: number) => {
    const value = Math.round(Math.max(0, Math.min(duration, ms)));
    if (media.current) media.current.currentTime = value / 1000;
    setTime(value);
  };
  const markIn = () => setIn(Math.min(Math.round(time), pointOut - 100));
  const markOut = () => setOut(Math.max(Math.round(time), pointIn + 100));
  async function toggle() {
    const element = media.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (time < pointIn || time >= pointOut - 10)
      element.currentTime = pointIn / 1000;
    try {
      await element.play();
    } catch {
      setError(tr("This media cannot be played in your browser."));
    }
  }
  const properties = {
    src: asset.url,
    preload: "auto",
    ref: media,
    muted: mode === "video",
    onLoadedMetadata: () => {
      setReady(true);
      // Opening a tile is the user's gesture: start playback right away.
      void media.current?.play().catch(() => undefined);
    },
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onError: () =>
      setError(
        tr("Unable to load the media preview. Check the file in the library."),
      ),
    onTimeUpdate: () => {
      if (!media.current) return;
      const ms = Math.round(media.current.currentTime * 1000);
      if (!media.current.paused && ranged && ms >= pointOut) {
        media.current.pause();
        media.current.currentTime = pointOut / 1000;
        setTime(pointOut);
      } else setTime(ms);
    },
  };
  const percent = (ms: number) => (duration ? (ms / duration) * 100 : 0);
  const modes = [
    asset.kind === "video" &&
      asset.has_audio && { value: "both", label: tr("Video + audio") },
    asset.kind === "video" && { value: "video", label: tr("Video only") },
    asset.kind === "video" &&
      asset.has_audio && { value: "audio", label: tr("Audio only") },
  ].filter(Boolean) as { value: SourceSelection["mode"]; label: string }[];
  return (
    <section
      className="source-monitor media-monitor"
      aria-label={tr("Preview of {{name}}", { name: asset.name })}
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest("input, select") ||
          e.metaKey ||
          e.ctrlKey ||
          e.altKey
        )
          return;
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
          return;
        }
        if (image) return;
        if (e.key === " " && (e.target as HTMLElement).closest("button"))
          return;
        if (["i", "o", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (e.key.toLowerCase() === "i") markIn();
        if (e.key.toLowerCase() === "o") markOut();
        if (e.key === "ArrowLeft" || e.key === "ArrowRight")
          seek(time + ((e.key === "ArrowRight" ? 1 : -1) * 1000) / fps);
        if (e.key === " ") void toggle();
      }}
    >
      <header className="media-monitor-header">
        <strong title={asset.name}>{asset.name}</strong>
        <IconButton label={tr("Close preview")} onClick={onClose}>
          <X size={15} />
        </IconButton>
      </header>
      <div className="media-monitor-stage">
        {image ? (
          <img src={asset.url} alt={asset.name} />
        ) : asset.kind === "video" ? (
          <video {...properties} playsInline onClick={() => void toggle()} />
        ) : (
          <>
            <audio {...properties} />
            {asset.thumbnail_url && (
              <img src={asset.thumbnail_url} alt="" aria-hidden />
            )}
          </>
        )}
        {!ready && !error && <p role="status">{tr("Loading preview…")}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      {!image && (
        <>
          <div
            className="media-monitor-scrub"
            style={
              {
                "--in": `${percent(pointIn)}%`,
                "--out": `${percent(pointOut)}%`,
                "--at": `${percent(time)}%`,
              } as React.CSSProperties
            }
          >
            <input
              aria-label={tr("Source position")}
              type="range"
              min={0}
              max={duration}
              step={1}
              value={time}
              disabled={!ready}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </div>
          <div className="media-monitor-transport">
            <IconButton
              label={playing ? tr("Pause") : tr("Play")}
              disabled={!ready || !!error}
              onClick={() => void toggle()}
            >
              {playing ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
            </IconButton>
            <output>
              {(time / 1000).toFixed(2)} / {(duration / 1000).toFixed(2)} s
            </output>
            <Button
              variant="ghost"
              size="sm"
              className="text-button"
              disabled={!ready}
              title={tr("Set In · I")}
              onClick={markIn}
            >
              {tr("In")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-button"
              disabled={!ready}
              title={tr("Set Out · O")}
              onClick={markOut}
            >
              {tr("Out")}
            </Button>
            {ranged && (
              <Button
                variant="ghost"
                size="sm"
                className="text-button"
                title={tr("Use the entire file")}
                onClick={() => {
                  setIn(0);
                  setOut(duration);
                }}
              >
                {tr("Range {{duration}} s", {
                  duration: ((pointOut - pointIn) / 1000).toFixed(2),
                })}
                <X size={12} />
              </Button>
            )}
          </div>
        </>
      )}
      <div className="media-monitor-actions">
        {modes.length > 1 && (
          <div
            className="media-monitor-modes"
            role="radiogroup"
            aria-label={tr("Source streams")}
          >
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                className={mode === m.value ? "selected" : ""}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        <Button
          variant="default"
          className="button primary"
          disabled={!valid}
          onClick={() => onInsert(intent)}
        >
          <ArrowDownToLine size={15} /> {tr("Insert at playhead")}
        </Button>
        <Button
          variant="outline"
          className="source-drag button"
          disabled={!valid}
          draggable={valid}
          aria-label={tr("Drag onto the timeline")}
          title={tr(
            "Drag the selected range onto the preview or a compatible track",
          )}
          onDragStart={(e) => {
            media.current?.pause();
            if (custom)
              e.dataTransfer.setData(sourceMime, JSON.stringify(selection));
            e.dataTransfer.setData("application/synkinema-asset", asset.id);
            e.dataTransfer.effectAllowed = "copy";
            useStudio.getState().set({
              draggingAsset: asset.id,
              draggingSource: custom ? selection : null,
            });
          }}
          onDragEnd={() =>
            useStudio
              .getState()
              .set({ draggingAsset: null, draggingSource: null })
          }
        >
          <GripVertical size={15} />
        </Button>
      </div>
    </section>
  );
}
