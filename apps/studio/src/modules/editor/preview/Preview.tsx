import { NativeSelect } from "@/components/ui/native-select";
import { tr, useLocale } from "@/lib/i18n";
import {
  canvasDrop,
  elementMime,
  type CanvasInsert,
} from "@/modules/editor/layerInsert";
import {
  CanvasTarget,
  captionAnchorX,
  captionPlacement,
  placementOf,
  placementStyle,
} from "@/modules/editor/preview/CanvasTools";
import CaptionPreview, {
  captionFade,
  CaptionPreloader,
} from "@/modules/editor/preview/CaptionPreview";
import { previewLayers } from "@/modules/editor/preview/previewLayers";
import { usePreviewSize } from "@/modules/editor/preview/usePreviewSize";
import { Clapperboard, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Asset, Clip, Project, Track } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import {
  audioLevel,
  connectAudioPreview,
  valueAt,
} from "@/modules/editor/timeline/timelineAudio";

import { timecode } from "@/lib/time";
function MediaElement({
  asset,
  clip,
  time,
  playing,
  audioOnly = false,
  trackGain = 0,
}: {
  asset: Asset;
  clip: Clip;
  time: number;
  playing: boolean;
  audioOnly?: boolean;
  trackGain?: number;
}) {
  const ref = useRef<HTMLMediaElement | null>(null);
  const audioNode = useRef<ReturnType<typeof connectAudioPreview>>(undefined);
  useEffect(() => {
    if (!audioOnly || !ref.current) return;
    audioNode.current = connectAudioPreview(ref.current);
    return () => {
      audioNode.current?.gain.disconnect();
      audioNode.current = undefined;
    };
  }, [audioOnly]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const expected =
      (clip.source_in_ms + (time - clip.start_ms) * clip.speed) / 1000;
    if (Math.abs(el.currentTime - expected) > 0.25)
      el.currentTime = Math.max(0, expected);
    el.playbackRate = clip.speed;
    const level = audioOnly ? audioLevel(clip, time, trackGain) : 0;
    if (audioNode.current) {
      el.volume = 1;
      audioNode.current.gain.gain.value = level;
      if (playing) void audioNode.current.context.resume().catch(() => {});
    } else el.volume = Math.min(1, level);
    if (playing) void el.play().catch(() => {});
    else el.pause();
  }, [
    asset.url,
    time,
    playing,
    clip.source_in_ms,
    clip.start_ms,
    clip.speed,
    clip.gain_db,
    clip.animations,
    clip.duration_ms,
    clip.fade_in_ms,
    clip.fade_out_ms,
    trackGain,
    audioOnly,
  ]);
  return audioOnly ? (
    <audio
      ref={(el) => {
        ref.current = el;
      }}
      src={asset.url}
    />
  ) : (
    <video
      ref={(el) => {
        ref.current = el;
      }}
      src={asset.url}
      muted
      playsInline
    />
  );
}
export function Preview({
  project,
  assets,
  renderedUrl: savedRenderedUrl,
  renderedSize,
  onChange,
  onInsert,
}: {
  project: Project;
  assets: Asset[];
  renderedUrl?: string | null;
  renderedSize?: Pick<Project["profile"], "width" | "height">;
  onChange: (
    track: Track,
    clip: Clip,
    changes: Partial<Clip>,
  ) => void | Promise<void>;
  onInsert: (intent: Omit<CanvasInsert, "start_ms">) => void;
}) {
  useLocale();
  const state = useStudio();
  const renderedUrl = state.audioDraft ? null : savedRenderedUrl;
  const [draft, setDraft] = useState<{
    id: string;
    projectId: string;
    changes: Partial<Clip>;
  } | null>(null);
  const updateDraft = (clip: Clip, changes: Partial<Clip> | null) =>
    setDraft(changes ? { id: clip.id, projectId: project.id, changes } : null);
  const commitDraft = (track: Track, clip: Clip, changes: Partial<Clip>) => {
    const released = { id: clip.id, projectId: project.id, changes };
    setDraft(released);
    const clear = () =>
      setDraft((current) => (current === released ? null : current));
    // Query prepares optimistic layers asynchronously. Keep the last pointer
    // position through that handoff and clear only this gesture on settlement.
    // A late save must not erase a newer drag; a failure must reveal rollback.
    try {
      const saving = onChange(track, clip, changes);
      if (saving) void saving.then(clear, clear);
      else clear();
    } catch (error) {
      clear();
      throw error;
    }
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const frameSize =
    renderedUrl && renderedSize ? renderedSize : project.profile;
  const canvasSize = usePreviewSize(
    stageRef,
    frameSize.width,
    frameSize.height,
    previewZoom,
  );
  const visual = previewLayers(project, state.time);
  const audio = project.tracks
    .filter(
      (t) =>
        !t.muted && ["voiceover", "music", "sound", "ambient"].includes(t.kind),
    )
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .filter(
      ({ clip: c }) =>
        state.time >= c.start_ms && state.time < c.start_ms + c.duration_ms,
    );
  useEffect(() => {
    if (renderedUrl) return;
    if (!state.playing) return;
    let id = 0;
    let previous = performance.now();
    if (state.time >= project.duration_ms - 30) state.set({ time: 0 });
    function tick(now: number) {
      if (now - previous < 1000 / 30) {
        id = requestAnimationFrame(tick);
        return;
      }
      const value = useStudio.getState();
      const next = value.time + (now - previous);
      previous = now;
      if (next >= project.duration_ms) {
        value.set({ time: project.duration_ms - 1, playing: false });
        return;
      }
      value.set({ time: next });
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [state.playing, project.duration_ms, renderedUrl]);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (Math.abs(el.currentTime - state.time / 1000) > 0.3)
      el.currentTime = state.time / 1000;
    if (state.playing)
      void el.play().catch(() => state.set({ playing: false }));
    else el.pause();
  }, [state.playing, state.time, renderedUrl]);
  return (
    <div
      className="preview-stage"
      ref={stageRef}
      onPointerDown={(e) => {
        if (
          !(e.target as Element).closest(
            ".canvas-target, button, input, select, textarea, video[controls], audio[controls]",
          )
        ) {
          state.set({ selectedId: null });
          setDraft(null);
        }
      }}
    >
      <div
        className={`preview-canvas ${dropActive ? "canvas-drop-active" : ""} ${renderedUrl ? "is-rendered" : ""}`}
        onDragOver={(e) => {
          if (
            !renderedUrl &&
            ["application/synkinema-asset", elementMime].some((m) =>
              e.dataTransfer.types.includes(m),
            )
          ) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            setDropActive(true);
            if (state.playing) state.set({ playing: false });
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDropActive(false);
        }}
        onDrop={(e) => {
          setDropActive(false);
          const intent = canvasDrop(e.dataTransfer);
          if (!renderedUrl && intent) {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onInsert({
              ...intent,
              center: {
                x: Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / rect.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, (e.clientY - rect.top) / rect.height),
                ),
              },
            });
            state.set({ draggingAsset: null, draggingSource: null });
          }
        }}
        style={{
          aspectRatio: `${frameSize.width}/${frameSize.height}`,
          width: canvasSize.width,
          height: canvasSize.height,
        }}
      >
        {dropActive && (
          <div className="canvas-drop-label">
            {tr("Add at {{time}} · reuse a free track or create a layer", {
              time: timecode(state.time),
            })}
          </div>
        )}
        {renderedUrl ? (
          <video
            ref={videoRef}
            src={renderedUrl}
            playsInline
            onTimeUpdate={(e) =>
              state.set({ time: e.currentTarget.currentTime * 1000 })
            }
            onEnded={() => state.set({ playing: false })}
          />
        ) : (
          <>
            <CaptionPreloader project={project} time={state.time} />
            {visual.map(({ track, clip: original, key }, index) => {
              const clip =
                draft?.projectId === project.id && draft.id === original.id
                  ? { ...original, ...draft.changes }
                  : original;
              const asset = assets.find((a) => a.id === clip.asset_id);
              const local = state.time - clip.start_ms;
              const transitionFade =
                clip.transition.type !== "cut" && clip.transition.duration_ms
                  ? Math.min(1, local / clip.transition.duration_ms)
                  : 1;
              const opacity =
                (track.kind === "video"
                  ? valueAt(clip, "opacity", state.time, clip.transform.opacity)
                  : clip.transform.opacity *
                    valueAt(clip, "opacity", state.time, 1)) *
                captionFade(clip, state.time) *
                transitionFade;
              let filter = "";
              for (const e of clip.effects.filter((e) => e.enabled)) {
                if (e.type === "blur")
                  filter += `blur(${(e.value * canvasSize.width) / project.profile.width}px) `;
                if (e.type === "grayscale") filter += `grayscale(${e.value}) `;
                if (e.type === "brightness")
                  filter += `brightness(${1 + e.value}) `;
                if (e.type === "contrast") filter += `contrast(${e.value}) `;
                if (e.type === "saturation") filter += `saturate(${e.value}) `;
              }
              return (
                <div
                  key={key}
                  className="preview-composition-layer"
                  style={{ zIndex: index + 1 }}
                >
                  {track.kind === "text" ? (
                    <CaptionPreview
                      project={project}
                      clip={original}
                      opacity={opacity}
                      imageStyle={(rasterClip) => ({
                        transform: `translate(${(captionAnchorX(clip) - captionAnchorX(rasterClip)) * canvasSize.width}px, ${(clip.text_y - rasterClip.text_y) * canvasSize.height}px) scale(${clip.font_size / rasterClip.font_size})`,
                        transformOrigin: `${captionAnchorX(rasterClip) * 100}% ${rasterClip.text_y * 100}%`,
                      })}
                    >
                      {(bounds, rasterClip) => (
                        <CanvasTarget
                          clip={clip}
                          track={track}
                          selected={state.selectedId === clip.id}
                          frameWidth={project.profile.width}
                          frameHeight={project.profile.height}
                          textPlacement={
                            bounds
                              ? captionPlacement(
                                  bounds,
                                  rasterClip,
                                  clip,
                                  project.profile,
                                )
                              : undefined
                          }
                          onSelect={() =>
                            state.set({ selectedId: clip.id, playing: false })
                          }
                          onDraft={(changes) => updateDraft(clip, changes)}
                          onCommit={(changes) =>
                            commitDraft(track, original, changes)
                          }
                        />
                      )}
                    </CaptionPreview>
                  ) : clip.shape ? (
                    <div
                      className="preview-shape"
                      style={{
                        ...placementStyle(placementOf(clip)),
                        background: clip.color,
                        borderRadius: clip.shape === "ellipse" ? "50%" : 0,
                        opacity,
                        transform: `rotate(${clip.transform.rotation}deg)`,
                      }}
                    />
                  ) : asset ? (
                    <div
                      className="placed-media"
                      style={{ ...placementStyle(placementOf(clip)), opacity }}
                    >
                      <div
                        className="preview-layer"
                        style={{
                          filter,
                          transform: `rotate(${clip.transform.rotation}deg)`,
                        }}
                      >
                        <div
                          className="media-lens"
                          style={{
                            transform: `scale(${valueAt(clip, "scale", state.time, clip.transform.scale)})`,
                            transformOrigin: `${valueAt(clip, "x", state.time, clip.transform.x) * 100}% ${valueAt(clip, "y", state.time, clip.transform.y) * 100}%`,
                          }}
                        >
                          {asset.kind === "image" ? (
                            <img
                              src={asset.url}
                              alt={clip.name}
                              draggable={false}
                              style={{
                                objectFit: clip.transform.fit,
                                objectPosition: `${clip.transform.x * 100}% ${clip.transform.y * 100}%`,
                              }}
                            />
                          ) : (
                            <MediaElement
                              asset={asset}
                              clip={clip}
                              time={state.time}
                              playing={state.playing}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {track.kind !== "text" && (
                    <CanvasTarget
                      clip={clip}
                      track={track}
                      selected={state.selectedId === clip.id}
                      frameWidth={project.profile.width}
                      frameHeight={project.profile.height}
                      onSelect={() =>
                        state.set({ selectedId: clip.id, playing: false })
                      }
                      onDraft={(changes) => updateDraft(clip, changes)}
                      onCommit={(changes) =>
                        commitDraft(track, original, changes)
                      }
                    />
                  )}
                </div>
              );
            })}
            {audio.map(({ clip: original, track }) => {
              const audioDraft = state.audioDraft;
              const c =
                audioDraft?.clipId === original.id
                  ? {
                      ...original,
                      ...(audioDraft.gain_db !== undefined
                        ? { gain_db: audioDraft.gain_db }
                        : {}),
                      ...(audioDraft.animations
                        ? { animations: audioDraft.animations }
                        : {}),
                    }
                  : original;
              const trackGain =
                audioDraft?.trackId === track.id && !audioDraft.clipId
                  ? (audioDraft.gain_db ?? track.gain_db ?? 0)
                  : (track.gain_db ?? 0);
              const asset = assets.find((a) => a.id === c.asset_id);
              return asset ? (
                <MediaElement
                  key={c.id}
                  asset={asset}
                  clip={c}
                  time={state.time}
                  playing={state.playing}
                  audioOnly
                  trackGain={trackGain}
                />
              ) : null;
            })}
            {!project.duration_ms && (
              <div className="preview-empty">
                <Clapperboard size={42} />
                <span>{tr("Your story starts here.")}</span>
                <small>{tr("Add media from the library")}</small>
              </div>
            )}
          </>
        )}
      </div>
      <div className="preview-workspace-tools focus-within:ring-2 focus-within:ring-ring/50">
        <ZoomOut size={13} aria-hidden="true" />
        <NativeSelect
          className="[&_select]:border-0 [&_select]:bg-transparent [&_select]:shadow-none [&_select]:focus-visible:ring-0 dark:[&_select]:bg-transparent dark:[&_select:hover]:bg-transparent"
          aria-label={tr("Preview zoom")}
          title={tr("Zoom out to reach elements outside the frame.")}
          value={previewZoom}
          onChange={(e) => setPreviewZoom(Number(e.target.value))}
        >
          <option value={1}>{tr("Fit")}</option>
          {[0.75, 0.5, 0.25].map((zoom) => (
            <option key={zoom} value={zoom}>
              {zoom * 100}%
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
