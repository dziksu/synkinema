import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { tr, useLocale } from "@/lib/i18n";
import { type CanvasInsert } from "@/modules/editor/layerInsert";
import { type MediaDestination } from "@/modules/media/MediaBrowser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useProjectEditing } from "./use-project-editing";

import { isOptimistic } from "@/api/cache";
import { writes } from "@/api/mutations";
import { keys, reads } from "@/api/queries";
import type { Asset, AudioReport, Clip, Project } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import {
  acceptsAsset,
  defaultAssetGain,
} from "@/modules/editor/timeline/timelineMath";
import { usePlaybackShortcut } from "@/modules/editor/usePlaybackShortcut";
import { useShallow } from "zustand/react/shallow";

export function useEditorController() {
  useLocale();
  const state = useStudio(useShallow(({ time: _time, ...rest }) => rest));
  const query = useQueryClient();
  const [inspectorReset, setInspectorReset] = useState(0);
  const inspectorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (inspectorRef.current) inspectorRef.current.scrollTop = 0;
  }, [state.selectedId]);
  const [notice, setNotice] = useState("");
  const [sourceAsset, setSourceAsset] = useState<Asset | null>(null);
  const [trackOpen, setTrackOpen] = useState(false);
  const [mediaDestination, setMediaDestination] = useState<MediaDestination>(
    {},
  );
  const [elementOpen, setElementOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionStyle, setCaptionStyle] =
    useState<Clip["caption_style"]>("editorial");
  const { search, updateSearch } = useWorkspaceNavigation();
  const tab = search.editorTab ?? "timeline";

  const [exportOpen, setExportOpen] = useState(false);
  const [inspection, setInspection] = useState<string | null>(null);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [audio, setAudio] = useState<AudioReport | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showRender, setShowRender] = useState(false);
  const [focusPreview, setFocusPreview] = useState(false);
  const {
    data: project,
    error: currentProjectError,
    isLoading: projectLoading,
  } = useQuery(reads.project(query, state.projectId));
  const { data: libraryAssets = [], error: libraryError } = useQuery(
    reads.assets(query),
  );
  const { data: projectAssets = [], error: projectAssetsError } = useQuery({
    ...reads.assets(query, state.projectId),
    enabled: !!state.projectId,
  });
  const assets = [
    ...new Map(
      [...libraryAssets, ...projectAssets].map((a) => [a.id, a]),
    ).values(),
  ];
  const { data: jobs = [], error: jobsError } = useQuery(reads.jobs(query));
  const { data: history = [] } = useQuery(
    reads.history(state.projectId, project?.revision),
  );
  const { data: reviews = [] } = useQuery(
    reads.reviews(query, state.projectId),
  );
  const { data: serverState, error: synchronizationError } = useQuery(
    reads.state(query),
  );
  const backgroundError =
    synchronizationError || jobsError || libraryError || projectAssetsError;
  useEffect(() => {
    if (backgroundError) setNotice(backgroundError.message);
  }, [backgroundError]);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [state.page]);
  const synchronizedIds = useRef(new Set<string>());
  useEffect(() => {
    if (!serverState) return;
    const currentIds = new Set(serverState.projects.map((p) => p.id));
    if (!isOptimistic(query, keys.projects)) {
      for (const id of synchronizedIds.current) {
        if (!currentIds.has(id)) {
          if (useStudio.getState().projectId === id)
            useStudio.getState().set({ page: "projects", projectId: null });
          query.removeQueries({ queryKey: keys.project(id) });
        }
      }
      synchronizedIds.current = currentIds;
    }
    if (!isOptimistic(query, keys.jobs))
      query.setQueryData(keys.jobs, serverState.jobs);
    const listed = query.getQueryData<Project[]>(keys.projects);
    if (
      !isOptimistic(query, keys.projects) &&
      listed &&
      JSON.stringify(listed.map((p) => [p.id, p.revision])) !==
        JSON.stringify(serverState.projects.map((p) => [p.id, p.revision]))
    ) {
      void query.invalidateQueries({ queryKey: keys.projects });
      void query.invalidateQueries({ queryKey: ["assets"] });
    }
    for (const p of serverState.projects) {
      const cached = query.getQueryData<Project>(keys.project(p.id));
      if (
        !isOptimistic(query, keys.project(p.id)) &&
        cached &&
        cached.revision < p.revision
      )
        void query.invalidateQueries({
          queryKey: keys.project(p.id),
          exact: true,
        });
    }
  }, [query, serverState]);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 7000);
      return () => clearTimeout(id);
    }
  }, [notice]);

  const [manageProject, setManageProject] = useState<{
    project: Project;
    mode: "edit" | "delete";
  }>();
  const { undoStacks, operation, resolveComment, addComment, edit } =
    useProjectEditing(
      project,
      assets,
      setNotice,
      setInspectorReset,
      setShowRender,
    );
  const upload = useMutation({
    ...writes.upload(query),
    onSuccess: () => setNotice(tr("Media imported")),
    onError: (e) => setNotice(e.message),
  });
  const dropzone = useDropzone({
    onDrop: (files) => {
      if (files.length)
        upload.mutate({ files, destination: { ...mediaDestination } });
    },
    onDropRejected: () =>
      setNotice(tr("Unsupported file. Choose a video, image or audio file.")),
    noKeyboard: true,
    noClick: true,
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
      "video/*": [".mp4", ".mov", ".webm", ".mkv"],
      "audio/*": [".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aiff"],
    },
  });
  const render = useMutation({
    ...writes.render(query),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["jobs"] });
      setExportOpen(false);
      setNotice(tr("Export added to the queue"));
      void updateSearch({ editorTab: "exports" });
    },
    onError: (e) => setNotice(e.message),
  });
  const selectedTrack = project?.tracks.find((t) =>
    t.clips.some((c) => c.id === state.selectedId),
  );
  const selected = selectedTrack?.clips.find((c) => c.id === state.selectedId);
  const { data: scopedJobs, error: scopedJobsError } = useQuery({
    ...reads.jobs(query, state.projectId),
    enabled: !!state.projectId,
  });
  useEffect(() => {
    if (scopedJobsError) setNotice(scopedJobsError.message);
  }, [scopedJobsError]);
  const projectJobs =
    scopedJobs || jobs.filter((j) => j.project_id === project?.id);
  const latest =
    projectJobs.find(
      (j) =>
        j.status === "completed" &&
        j.revision === project?.revision &&
        j.request.quality === "final",
    ) ||
    projectJobs.find(
      (j) => j.status === "completed" && j.revision === project?.revision,
    );
  useEffect(() => {
    setShowRender(false);
    setAudio(null);
    setSourceAsset(null);
    state.set({ draggingAsset: null, draggingSource: null });
  }, [state.projectId]);
  const addAsset = (asset: Asset) => {
    if (!project) return;
    if (asset.duration_ms && asset.duration_ms < 100) {
      setNotice(
        tr(
          "This media is shorter than 0.1 s. Choose a longer version of the effect.",
        ),
      );
      return;
    }
    const preferred =
      asset.kind === "audio"
        ? project.tracks.find(
            (t) => t.kind === (asset.tags.includes("sfx") ? "sound" : "music"),
          )
        : project.tracks.find((t) => t.kind === "video");
    const target =
      (selectedTrack && acceptsAsset(selectedTrack, asset)
        ? selectedTrack
        : undefined) ||
      preferred ||
      project.tracks.find((t) => acceptsAsset(t, asset));
    if (!target) {
      setNotice(tr("Add a compatible video or audio track first."));
      return;
    }
    const start = Math.max(
      0,
      ...target.clips.map((c) => c.start_ms + c.duration_ms),
    );
    edit("add_clip", {
      track_id: target.id,
      append: true,
      clip: {
        name: asset.name,
        asset_id: asset.id,
        start_ms: start,
        duration_ms: asset.duration_ms || 4000,
        gain_db: defaultAssetGain(asset),
      },
    });
  };
  const addText = () => setCaptionOpen(true);
  const insertOnCanvas = (intent: Omit<CanvasInsert, "start_ms">) => {
    edit("insert_canvas", { ...intent, start_ms: useStudio.getState().time });
    state.set({ playing: false, draggingAsset: null, draggingSource: null });
    setElementOpen(false);
  };
  const insertVisual = (
    shape?: Clip["shape"],
    asset?: Asset,
    center?: { x: number; y: number },
  ) =>
    insertOnCanvas({ shape: shape || undefined, asset_id: asset?.id, center });
  const insertCaption = () => {
    edit("insert_layer", {
      kind: "text",
      clip: {
        name: tr("New caption"),
        text: tr("Your story."),
        start_ms: useStudio.getState().time,
        duration_ms: 3000,
        font_size: 80,
        caption_style: captionStyle,
      },
    });
  };
  const updateClip = (changes: Partial<Clip>) => {
    if (!selected || !selectedTrack) return;
    edit("inspector_update", {
      track_id: selectedTrack.id,
      clip_id: selected.id,
      changes,
      animation_duration_ms: selected.duration_ms,
    });
  };
  async function inspect(mode: "frame" | "sheet" | "audio") {
    if (!project) return;
    setInspectBusy(true);
    try {
      if (mode === "audio") {
        setAudio(
          await query.fetchQuery(
            reads.audio(project.id, {
              revision: project.revision,
              job_id: latest?.id,
            }),
          ),
        );
      } else {
        const data =
          mode === "frame"
            ? await query.fetchQuery(
                reads.frame(project.id, {
                  time_ms: Math.max(
                    0,
                    Math.min(
                      Math.round(useStudio.getState().time),
                      project.duration_ms - 1,
                    ),
                  ),
                  revision: project.revision,
                }),
              )
            : await query.fetchQuery(
                reads.sheet(project.id, { revision: project.revision }),
              );
        setInspection(data.url);
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setInspectBusy(false);
    }
  }
  usePlaybackShortcut(
    state.page === "studio" && tab === "timeline" && !!project?.duration_ms,
  );
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], .source-monitor',
        ) ||
        state.page !== "studio" ||
        tab !== "timeline"
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        edit("restore_revision", {}, e.shiftKey ? "redo" : "undo");
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selected &&
        selectedTrack
      ) {
        e.preventDefault();
        edit("remove_clip", {
          track_id: selectedTrack.id,
          clip_id: selected.id,
        });
        state.set({ selectedId: null });
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  return {
    setMediaDestination,
    insertOnCanvas,
    state,
    query,
    inspectorReset,
    inspectorRef,
    notice,
    setNotice,
    sourceAsset,
    setSourceAsset,
    trackOpen,
    setTrackOpen,
    elementOpen,
    setElementOpen,
    captionOpen,
    setCaptionOpen,
    captionStyle,
    setCaptionStyle,
    tab,
    exportOpen,
    setExportOpen,
    inspection,
    setInspection,
    inspectBusy,
    audio,
    zoom,
    setZoom,
    showRender,
    setShowRender,
    focusPreview,
    setFocusPreview,
    project,
    currentProjectError,
    projectLoading,
    libraryAssets,
    projectAssets,
    assets,
    history,
    reviews,
    manageProject,
    setManageProject,
    undoStacks,
    operation,
    resolveComment,
    addComment,
    edit,
    upload,
    dropzone,
    render,
    selectedTrack,
    selected,
    projectJobs,
    latest,
    addAsset,
    addText,
    insertVisual,
    insertCaption,
    updateClip,
    inspect,
  };
}
export type EditorController = ReturnType<typeof useEditorController>;
