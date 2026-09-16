import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import { seconds, timecode } from "@/lib/time";
import CurrentTime from "@/modules/editor/CurrentTime";
import { EditorPanels, EditorTop } from "@/modules/editor/EditorLayout";
import type { EditorController } from "@/modules/editor/hooks/use-editor-controller";
import ClipInspector from "@/modules/editor/inspector/ClipInspector";
import { Preview } from "@/modules/editor/preview/Preview";
import SourceMonitor from "@/modules/editor/source/SourceMonitor";
import { useStudio } from "@/modules/editor/store";
import Timeline from "@/modules/editor/timeline/Timeline";
import { audioKinds, freeStart } from "@/modules/editor/timeline/timelineMath";
import MediaBrowser from "@/modules/media/MediaBrowser";
import {
  ArrowRight,
  Copy,
  Frame,
  History,
  Layers,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SlidersHorizontal,
  Type,
  Volume2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
export function EditorTimeline({
  controller,
}: {
  controller: EditorController;
}) {
  const {
    state,
    inspectorReset,
    inspectorRef,
    setNotice,
    sourceAsset,
    setSourceAsset,
    setTrackOpen,
    setMediaDestination,
    setElementOpen,
    inspectBusy,
    zoom,
    setZoom,
    showRender,
    setShowRender,
    focusPreview,
    setFocusPreview,
    project,
    libraryAssets,
    projectAssets,
    assets,
    reviews,
    undoStacks,
    operation,
    edit,
    dropzone,
    selectedTrack,
    selected,
    latest,
    addAsset,
    addText,
    insertOnCanvas,
    insertVisual,
    updateClip,
    inspect,
  } = controller;
  if (!project) return null;
  return (
    <EditorPanels>
      <EditorTop sourceOpen={!!sourceAsset}>
        <section className="asset-panel">
          <div className="panel-heading">
            <h2>
              {sourceAsset
                ? tr("Source · {{name}}", { name: sourceAsset.name })
                : tr("Project media")}
            </h2>
            <IconButton label={tr("Import media")} onClick={dropzone.open}>
              <Plus size={18} />
            </IconButton>
          </div>
          {sourceAsset ? (
            <SourceMonitor
              key={sourceAsset.id}
              asset={sourceAsset}
              tracks={project.tracks}
              fps={project.profile.fps}
              busy={operation.isPending}
              onClose={() => setSourceAsset(null)}
              onInsert={(intent) => edit("insert_source", intent)}
            />
          ) : (
            <MediaBrowser
              key={project.id}
              project={project}
              projectAssets={projectAssets}
              libraryAssets={libraryAssets}
              onAdd={addAsset}
              onOverlay={(a) => insertVisual(undefined, a)}
              onPreview={(a) => {
                state.set({ playing: false });
                setSourceAsset(a);
              }}
              onImport={dropzone.open}
              onDestination={setMediaDestination}
              onError={setNotice}
            />
          )}
        </section>
        <section className={`viewer ${focusPreview ? "viewer-expanded" : ""}`}>
          <div className="viewer-toolbar">
            <span>
              <span className="status-dot" />
              {showRender
                ? latest?.request.quality === "preview"
                  ? tr("Draft preview")
                  : tr("Last export")
                : tr("Timeline preview")}
            </span>
            <div>
              <Button
                variant="ghost"
                className="text-button"
                onClick={() => setElementOpen(true)}
              >
                <Plus size={15} />
                {tr("Elements")}
              </Button>
              <Button variant="ghost" className="text-button" onClick={addText}>
                <Type size={15} />
                {tr("Caption")}
              </Button>
              {latest?.output_url && (
                <Button
                  variant="ghost"
                  className="text-button"
                  onClick={() => setShowRender(!showRender)}
                >
                  {showRender ? tr("Back to timeline") : tr("Play export")}
                </Button>
              )}
              <IconButton
                label={
                  focusPreview
                    ? tr("Close expanded preview")
                    : tr("Expand preview")
                }
                onClick={() => setFocusPreview(!focusPreview)}
              >
                {focusPreview ? <X size={16} /> : <Maximize2 size={16} />}
              </IconButton>
              <IconButton
                label={tr("Inspect current frame")}
                disabled={
                  inspectBusy || operation.isPending || !project.duration_ms
                }
                onClick={() => void inspect("frame")}
              >
                {inspectBusy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Frame size={16} />
                )}
              </IconButton>
            </div>
          </div>
          <Preview
            project={project}
            assets={assets}
            onChange={async (track, clip, changes) => {
              await edit("inspector_update", {
                track_id: track.id,
                clip_id: clip.id,
                changes,
                animation_duration_ms: clip.duration_ms,
              });
            }}
            onInsert={insertOnCanvas}
            renderedUrl={showRender ? latest?.output_url : undefined}
            renderedSize={
              latest?.output ||
              (latest?.metadata?.width && latest?.metadata?.height
                ? {
                    width: latest.metadata.width,
                    height: latest.metadata.height,
                  }
                : undefined)
            }
          />
          <div className="transport">
            <span className="timecode">
              <CurrentTime /> <b>/ {timecode(project.duration_ms)}</b>
            </span>
            <div>
              <IconButton
                label={tr("Go to start")}
                onClick={() => state.set({ time: 0, playing: false })}
              >
                <SkipBack size={16} />
              </IconButton>
              <Button
                variant="outline"
                className="play-button"
                aria-label={state.playing ? tr("Pause") : tr("Play")}
                onClick={() => state.set({ playing: !state.playing })}
                disabled={!project.duration_ms}
              >
                {state.playing ? (
                  <Pause size={19} fill="currentColor" />
                ) : (
                  <Play size={19} fill="currentColor" />
                )}
              </Button>
              <IconButton
                label={tr("Go to next shot")}
                onClick={() => {
                  const starts = project.tracks
                    .flatMap((t) => t.clips.map((c) => c.start_ms))
                    .sort((a, b) => a - b);
                  state.set({
                    time:
                      starts.find((t) => t > useStudio.getState().time + 50) ||
                      0,
                  });
                }}
              >
                <ArrowRight size={17} />
              </IconButton>
            </div>
            <span className="preview-label">
              {showRender ? "FFmpeg" : tr("Simplified preview")}
            </span>
          </div>
        </section>
        <aside className="inspector" ref={inspectorRef}>
          <div className="panel-heading">
            <h2>{selected ? tr("Clip properties") : tr("Project")}</h2>
            <SlidersHorizontal size={16} />
          </div>
          {selected && selectedTrack ? (
            <>
              <div className="manual-actions">
                <Button
                  variant="outline"
                  className="button"
                  onClick={() => {
                    const { id: _id, ...copy } = selected;
                    edit("add_clip", {
                      track_id: selectedTrack!.id,
                      clip: {
                        ...copy,
                        name: tr("{{name}} — copy", {
                          name: selected.name,
                        }),
                        transition: { type: "cut", duration_ms: 0 },
                        start_ms: freeStart(
                          selectedTrack!,
                          selected.start_ms + selected.duration_ms,
                          selected.duration_ms,
                        ),
                      },
                    });
                  }}
                >
                  <Copy size={14} /> {tr("Duplicate")}{" "}
                </Button>
                {assets.find((a) => a.id === selected.asset_id)?.has_audio &&
                  ["video", "overlay"].includes(selectedTrack!.kind) && (
                    <Button
                      variant="outline"
                      className="button"
                      onClick={() => {
                        const track =
                          project.tracks.find((t) => t.kind === "sound") ||
                          project.tracks.find((t) => t.kind === "music") ||
                          project.tracks.find((t) =>
                            audioKinds.includes(t.kind),
                          );
                        if (track)
                          edit("extract_audio", {
                            track_id: selectedTrack.id,
                            clip_id: selected.id,
                            target_track_id: track.id,
                          });
                        else
                          setNotice(
                            tr(
                              "Add an audio track to extract this video's sound.",
                            ),
                          );
                      }}
                    >
                      <Volume2 size={14} /> {tr("Extract video audio")}{" "}
                    </Button>
                  )}
              </div>
              <ClipInspector
                key={`${selected.id}-${inspectorReset}`}
                clip={selected}
                track={selectedTrack}
                onChange={updateClip}
                onRemove={() => {
                  edit("remove_clip", {
                    track_id: selectedTrack.id,
                    clip_id: selected.id,
                  });
                  state.set({ selectedId: null });
                }}
              />
            </>
          ) : (
            <div className="project-info">
              <div className="inspector-symbol">
                <WandSparkles size={30} />
              </div>
              <h3>{project.name}</h3>
              <p>
                {" "}
                {tr(
                  "Select a timeline clip to edit its image, motion and sound.",
                )}{" "}
              </p>
              <dl>
                <dt>{tr("Format")}</dt>
                <dd>
                  {project.profile.width}:{project.profile.height}
                </dd>
                <dt>{tr("Duration")}</dt>
                <dd>{seconds(project.duration_ms)}</dd>
                <dt>{tr("Tracks")}</dt>
                <dd>{project.tracks.length}</dd>
                <dt>{tr("Revision")}</dt>
                <dd>{project.revision}</dd>
              </dl>
              <Button
                variant="outline"
                className="button wide"
                disabled={
                  inspectBusy || operation.isPending || !project.duration_ms
                }
                onClick={() => void inspect("sheet")}
              >
                <Frame size={16} /> {tr("Contact sheet")}{" "}
              </Button>
            </div>
          )}
        </aside>
      </EditorTop>
      <section className="timeline">
        <div className="timeline-toolbar">
          <div>
            <span className="timeline-label">
              <Layers size={16} /> {tr("Timeline")}{" "}
            </span>
            <IconButton
              label={tr("Undo last change")}
              disabled={
                !undoStacks.current[project.id]?.undo.length ||
                operation.isPending
              }
              onClick={() => edit("restore_revision", {}, "undo")}
            >
              <History size={16} />
            </IconButton>
            <IconButton
              label={tr("Redo change")}
              disabled={
                !undoStacks.current[project.id]?.redo.length ||
                operation.isPending
              }
              onClick={() => edit("restore_revision", {}, "redo")}
            >
              <ArrowRight size={16} />
            </IconButton>
            <span className="divider" />
            <IconButton
              label={tr("Split clip at playhead")}
              disabled={!selected || operation.isPending}
              onClick={() =>
                selected &&
                edit("split_clip", {
                  track_id: selectedTrack!.id,
                  clip_id: selected.id,
                  time_ms: Math.round(useStudio.getState().time),
                })
              }
            >
              <Scissors size={16} />
            </IconButton>
            <Button
              variant="ghost"
              className="text-button"
              onClick={() => setTrackOpen(true)}
            >
              <Plus size={16} /> {tr("Track")}{" "}
            </Button>
            <Button variant="ghost" className="text-button" onClick={addText}>
              <Type size={16} /> {tr("Add caption")}{" "}
            </Button>
          </div>
          <div>
            <IconButton
              label={tr("Zoom out timeline")}
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            >
              <ZoomOut size={16} />
            </IconButton>
            <span>{Math.round(zoom * 100)}%</span>
            <IconButton
              label={tr("Zoom in timeline")}
              onClick={() => setZoom(Math.min(5, zoom + 0.25))}
            >
              <ZoomIn size={16} />
            </IconButton>
          </div>
        </div>
        <Timeline
          project={project}
          assets={assets}
          zoom={zoom}
          reviews={reviews}
          onEdit={async (...args) => {
            await edit(...args);
          }}
        />
      </section>
    </EditorPanels>
  );
}
