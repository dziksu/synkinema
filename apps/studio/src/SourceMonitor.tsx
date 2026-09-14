import { useLocale, tr } from "./i18n";
import { useRef, useState } from "react";
import { ArrowLeft, GripVertical, Play, Pause } from "lucide-react";
import NumberField from "./NumberField";
import { useStudio } from "./store";
import { audioKinds } from "./timelineMath";
import {
  acceptsSource,
  sourceMime,
  type SourceInsert,
  type SourceSelection,
} from "./sourceInsert";
import type { Asset, Track } from "./types";

export default function SourceMonitor({
  asset,
  tracks,
  fps,
  busy,
  onClose,
  onInsert,
}: {
  asset: Asset;
  tracks: Track[];
  fps: number;
  busy: boolean;
  onClose: () => void;
  onInsert: (intent: SourceInsert) => void;
}) {
  useLocale();
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const duration = asset.duration_ms || 0;
  const [pointIn, setIn] = useState(0),
    [pointOut, setOut] = useState(duration);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState<SourceSelection["mode"]>(
    asset.kind === "audio" ? "audio" : asset.has_audio ? "both" : "video",
  );
  const [trackId, setTrackId] = useState("");
  const [audioId, setAudioId] = useState(
    tracks.find((t) => t.kind === "music")?.id ||
      tracks.find((t) => audioKinds.includes(t.kind))?.id ||
      "new",
  );
  const selection: SourceSelection = {
    asset_id: asset.id,
    source_in_ms: pointIn,
    duration_ms: pointOut - pointIn,
    mode,
    audio_track_id: audioId,
  };
  const compatible = tracks.filter((t) => acceptsSource(t, asset, selection));
  const target = compatible.find((t) => t.id === trackId) || compatible[0];
  const valid = ready && duration >= 100 && !!target && !busy && !error;
  const seek = (ms: number) => {
    const value = Math.round(Math.max(0, Math.min(duration, ms)));
    if (media.current) {
      media.current.pause();
      media.current.currentTime = value / 1000;
    }
    setTime(value);
  };
  const markIn = () => setIn(Math.min(Math.round(time), pointOut - 100));
  const markOut = () => setOut(Math.max(Math.round(time), pointIn + 100));
  async function playRange() {
    if (!media.current) return;
    if (playing) {
      media.current.pause();
      return;
    }
    media.current.currentTime = pointIn / 1000;
    try {
      await media.current.play();
    } catch {
      setError(tr("This media cannot be played in your browser."));
    }
  }
  const properties = {
    src: asset.url,
    preload: "metadata",
    ref: media,
    muted: mode === "video",
    onLoadedMetadata: () => setReady(true),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onError: () =>
      setError(
        tr("Unable to load the media preview. Check the file in the library."),
      ),
    onTimeUpdate: () => {
      if (!media.current) return;
      const ms = Math.round(media.current.currentTime * 1000);
      if (!media.current.paused && ms >= pointOut) {
        media.current.pause();
        media.current.currentTime = pointOut / 1000;
        setTime(pointOut);
      } else setTime(ms);
    },
  };
  return (
    <section
      className="source-monitor"
      aria-label={tr("Source preview for {{name}}", { name: asset.name })}
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest("input, select") ||
          e.metaKey ||
          e.ctrlKey ||
          e.altKey
        )
          return;
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
        if (e.key === " ") void playRange();
      }}
    >
      <button className="text-button" onClick={onClose}>
        <ArrowLeft size={15} /> {tr("Media library")}{" "}
      </button>
      <h3>{asset.name}</h3>
      <div className="source-workspace">
        <div className="source-preview">
          <div className="source-playback">
            {asset.kind === "video" ? (
              <video {...properties} className="source-video" playsInline />
            ) : (
              <audio {...properties} />
            )}
            {!ready && !error && <p role="status">{tr("Loading preview…")}</p>}
            {error && <p role="alert">{error}</p>}
            <div className="source-transport">
              <button
                className="icon-button"
                disabled={!ready || !!error}
                aria-label={
                  playing ? tr("Stop source range") : tr("Play source range")
                }
                onClick={() => void playRange()}
              >
                {playing ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <output>
                {(time / 1000).toFixed(2)} / {(duration / 1000).toFixed(2)} s
              </output>
            </div>
            <input
              aria-label={tr("Source position")}
              type="range"
              min={0}
              max={duration}
              step={1}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </div>
          <div className="source-range">
            <div className="source-range-fields">
              <NumberField
                label={tr("Source In (s)")}
                value={pointIn / 1000}
                min={0}
                max={(pointOut - 100) / 1000}
                step={0.01}
                onChange={(s) => {
                  setIn(Math.round(s * 1000));
                  seek(s * 1000);
                }}
              />
              <NumberField
                label={tr("Source Out (s)")}
                value={pointOut / 1000}
                min={(pointIn + 100) / 1000}
                max={duration / 1000}
                step={0.01}
                onChange={(s) => {
                  setOut(Math.round(s * 1000));
                  seek(s * 1000);
                }}
              />
              <button className="button" disabled={!ready} onClick={markIn}>
                {" "}
                {tr("Set In · I")}{" "}
              </button>
              <button className="button" disabled={!ready} onClick={markOut}>
                {" "}
                {tr("Set Out · O")}{" "}
              </button>
            </div>
            <p className="source-duration">
              {" "}
              {tr("Range: {{duration}} s", {
                duration: ((pointOut - pointIn) / 1000).toFixed(2),
              })}{" "}
              <button
                className="text-button"
                onClick={() => {
                  setIn(0);
                  setOut(duration);
                  seek(0);
                }}
              >
                {" "}
                {tr("Entire file")}{" "}
              </button>
            </p>
          </div>
        </div>
        <div className="source-config">
          <label className="field">
            {" "}
            {tr("Insert media")}{" "}
            <select
              aria-label={tr("Source streams")}
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as SourceSelection["mode"])
              }
            >
              {asset.kind === "video" && (
                <option value="video">{tr("Video only")}</option>
              )}
              {(asset.has_audio || asset.kind === "audio") && (
                <option value="audio">{tr("Audio only")}</option>
              )}
              {asset.kind === "video" && asset.has_audio && (
                <option value="both">{tr("Video and audio")}</option>
              )}
            </select>
          </label>
          <label className="field">
            {" "}
            {tr("Destination track")}{" "}
            <select
              aria-label={tr("Source destination track")}
              value={target?.id || ""}
              onChange={(e) => setTrackId(e.target.value)}
            >
              {!compatible.length && (
                <option value="">{tr("Add a compatible track")}</option>
              )}
              {compatible.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.muted ? tr(" (muted)") : ""}
                </option>
              ))}
            </select>
          </label>
          {mode === "both" && (
            <label className="field">
              {" "}
              {tr("Separate audio track")}{" "}
              <select
                aria-label={tr("Source audio track")}
                value={audioId}
                onChange={(e) => setAudioId(e.target.value)}
              >
                {tracks
                  .filter((t) => audioKinds.includes(t.kind))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.muted ? tr(" (muted)") : ""}
                    </option>
                  ))}
                <option value="new">{tr("+ New audio track")}</option>
              </select>
            </label>
          )}
          <div className="source-insert-actions">
            <button
              className="button primary"
              disabled={!valid}
              onClick={() =>
                target &&
                onInsert({
                  ...selection,
                  track_id: target.id,
                  start_ms: Math.round(useStudio.getState().time),
                })
              }
            >
              {" "}
              {tr("Insert at playhead")}{" "}
            </button>
            <button
              className="button"
              disabled={!valid}
              onClick={() =>
                target &&
                onInsert({
                  ...selection,
                  track_id: target.id,
                  start_ms: 0,
                  append: true,
                })
              }
            >
              {" "}
              {tr("Append to track")}{" "}
            </button>
            <button
              className="source-drag button"
              disabled={!valid}
              draggable={valid}
              title={tr(
                "Drag the selected range onto the preview or a compatible track",
              )}
              onDragStart={(e) => {
                media.current?.pause();
                e.dataTransfer.setData(sourceMime, JSON.stringify(selection));
                e.dataTransfer.setData("application/synkinema-asset", asset.id);
                e.dataTransfer.effectAllowed = "copy";
                useStudio
                  .getState()
                  .set({ draggingAsset: asset.id, draggingSource: selection });
              }}
              onDragEnd={() =>
                useStudio
                  .getState()
                  .set({ draggingAsset: null, draggingSource: null })
              }
            >
              <GripVertical size={16} />{" "}
              {tr("Drag source range · {{duration}} s", {
                duration: ((pointOut - pointIn) / 1000).toFixed(2),
              })}
            </button>
          </div>
          <small>
            {" "}
            {tr(
              "Drop onto the preview to keep the playhead time and reuse or create free layers. Inserting into a chosen track uses its next free gap. Video and audio remain aligned; undo removes both.",
            )}{" "}
          </small>
        </div>
      </div>
    </section>
  );
}
