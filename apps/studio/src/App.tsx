import { useLocale, tr, i18n, trackKindLabel, operationLabel } from "./i18n";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { useDropzone } from "react-dropzone";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  Clapperboard,
  Copy,
  Film,
  FolderOpen,
  Frame,
  History,
  Layers,
  LoaderCircle,
  Maximize2,
  Mic,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Scissors,
  Settings2,
  SkipBack,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import MediaBrowser, { type MediaDestination } from "./MediaBrowser";
import { appVersion } from "./version";
import {
  CanvasTarget,
  CaptionStyles,
  captionPlacement,
  PlacementControls,
  placementOf,
  placementStyle,
} from "./CanvasTools";
import Timeline from "./Timeline";
import NumberField from "./NumberField";
import SourceMonitor from "./SourceMonitor";
import VoiceGenerator from "./VoiceGenerator";
import { usePreviewSize } from "./usePreviewSize";
import { sourceInsert, type SourceInsert } from "./sourceInsert";
import RenderQueue from "./RenderQueue";
import ExportSettings, { formatLabel } from "./ExportSettings";
import ProjectManager from "./ProjectManager";
import Channels, { ChannelSelect } from "./Channels";
import PageHeader from "./PageHeader";
import ProjectThumbnail from "./ProjectThumbnail";
import { projectsByCreatedAt } from "./projectOrder";
import MediaLibrary from "./MediaLibrary";
import ElementPicker from "./ElementPicker";
import {
  canvasInsert,
  canvasDrop,
  layerInsert,
  elementMime,
  type CanvasInsert,
} from "./layerInsert";
import CaptionPreview, {
  CaptionPreloader,
  captionFade,
} from "./CaptionPreview";
import AgentPromptCopyButton from "./AgentPromptCopyButton";
import { agentInstructionsPrompt, projectAgentPrompt } from "./agentPrompts";

import {
  freeStart,
  acceptsAsset,
  audioKinds,
  defaultAssetGain,
  clampTimelineHeight,
} from "./timelineMath";
import { inspectorEdit } from "./inspectorEdit";
import { deleteTimelineTrack } from "./timelineActions";
import { valueAt, audioLevel, connectAudioPreview } from "./timelineAudio";
import { usePlaybackShortcut } from "./usePlaybackShortcut";
import { EditorTop, SidebarToggle, useSidebarCollapsed } from "./EditorLayout";
import { reads, keys } from "./api/queries";
import { writes } from "./api/mutations";
import { isOptimistic } from "./api/cache";
import { projectWrites } from "./api/projectMutations";
import { downloadText } from "./api/download";
import type { EditStep } from "./api/generated/client";
import { useStudio } from "./store";
import { useShallow } from "zustand/react/shallow";
import type { Asset, AudioReport, Clip, Project, Track } from "./types";

const timecode = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`icon-button ${className}`}
    >
      {children}
    </button>
  );
}
function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  useLocale();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-title">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label={tr("Close")}>
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function App() {
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
  const [trackKind, setTrackKind] = useState("overlay");
  const [trackName, setTrackName] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [newFormat, setNewFormat] = useState("reel-1080");
  const exportCatalog = useQuery({
    ...reads.exportPresets(),
    enabled: newOpen,
  });
  const [mediaDestination, setMediaDestination] = useState<MediaDestination>(
    {},
  );
  const [elementOpen, setElementOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionStyle, setCaptionStyle] =
    useState<Clip["caption_style"]>("editorial");
  const [tab, setTab] = useState("timeline");

  const [exportOpen, setExportOpen] = useState(false);
  const [inspection, setInspection] = useState<string | null>(null);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [audio, setAudio] = useState<AudioReport | null>(null);
  const [timelineHeight, setTimelineHeight] = useState(() =>
    clampTimelineHeight(window.innerHeight),
  );
  const sidebar = useSidebarCollapsed();
  useEffect(() => {
    const resize = () =>
      setTimelineHeight((v) => clampTimelineHeight(window.innerHeight, v));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const timelineResize = useRef<{ y: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showRender, setShowRender] = useState(false);
  const [focusPreview, setFocusPreview] = useState(false);
  const { data: projects = [], error: projectError } = useQuery(
    reads.projects(query),
  );
  // Covers need media from every project, not just the selected editor scope.
  // Reuse the owner inventory without exposing private media in the library.
  const { data: coverAssets = [], error: coverAssetsError } = useQuery({
    ...reads.inventory(query),
    enabled: state.page === "projects",
  });
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
  const undoStacks = useRef<Record<string, { undo: number[]; redo: number[] }>>(
    {},
  );
  const operationMutation = useMutation(projectWrites(query));
  const pendingEdits = useIsMutating({ mutationKey: ["project-edit"] });
  const operation = { ...operationMutation, isPending: pendingEdits > 0 };
  const resolveComment = useMutation({
    ...writes.resolveComment(query),
    onError: (e) => setNotice(e.message),
  });
  const addComment = useMutation({
    ...writes.comment(query),
    onError: (e) => setNotice(e.message),
  });
  const edit = (
    type: string,
    payload: unknown,
    direction?: "undo" | "redo",
  ) => {
    if (!project) return;
    const id = project.id;
    // Preserve only changed transform properties before the preceding request completes.
    const intent = structuredClone(payload) as Record<string, any>;
    if (
      ["update_clip", "inspector_update"].includes(type) &&
      intent.changes?.transform
    ) {
      const old = project.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === intent.clip_id);
      intent.changes.transform = Object.fromEntries(
        Object.entries(intent.changes.transform).filter(
          ([key, value]) =>
            value !== old?.transform[key as keyof Clip["transform"]],
        ),
      );
    }
    if (intent.changes?.placement) {
      const old = project.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === intent.clip_id);
      intent.changes.placement = Object.fromEntries(
        Object.entries(intent.changes.placement).filter(
          ([key, value]) =>
            value !==
            old?.placement?.[key as keyof NonNullable<Clip["placement"]>],
        ),
      );
    }
    const oldEffects =
      project.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === intent.clip_id)?.effects || [];
    const newEffects = intent.changes?.effects as Clip["effects"] | undefined;
    const newAnimations = intent.changes?.animations as
      | Clip["animations"]
      | undefined;
    const oldAnimations =
      project.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === intent.clip_id)?.animations || [];
    const touchedAnimations = newAnimations
      ? new Set(
          [...oldAnimations, ...newAnimations]
            .filter(
              (animation) =>
                JSON.stringify(
                  oldAnimations.find((a) => a.property === animation.property),
                ) !==
                JSON.stringify(
                  newAnimations.find((a) => a.property === animation.property),
                ),
            )
            .map((a) => a.property),
        )
      : null;
    const touchedEffects = newEffects
      ? new Set(
          [...oldEffects, ...newEffects]
            .filter(
              (effect) =>
                JSON.stringify(
                  oldEffects.find((e) => e.type === effect.type),
                ) !==
                JSON.stringify(newEffects.find((e) => e.type === effect.type)),
            )
            .map((e) => e.type),
        )
      : null;
    let resolvedDirectionRevision: number | undefined;
    let before: Project;
    return operation
      .mutateAsync({
        projectId: id,
        resolve: async (current) => {
          before = current;
          const stacks = (undoStacks.current[id] ||= { undo: [], redo: [] });
          if (direction) {
            const revision = stacks[direction].at(-1);
            if (revision === undefined) throw new Error(tr("Nothing to undo."));
            intent.revision = revision;
            resolvedDirectionRevision = revision;
          }
          if (intent.changes?.transform) {
            const clip = current.tracks
              .flatMap((t) => t.clips)
              .find((c) => c.id === intent.clip_id);
            intent.changes.transform = {
              ...clip?.transform,
              ...intent.changes.transform,
            };
          }
          if (intent.changes?.placement) {
            const clip = current.tracks
              .flatMap((t) => t.clips)
              .find((c) => c.id === intent.clip_id);
            intent.changes.placement = {
              ...(clip ? placementOf(clip) : {}),
              ...intent.changes.placement,
            };
          }
          if (touchedEffects && newEffects) {
            const existing =
              current.tracks
                .flatMap((t) => t.clips)
                .find((c) => c.id === intent.clip_id)?.effects || [];
            intent.changes.effects = [
              ...existing.filter((e) => !touchedEffects.has(e.type)),
              ...newEffects.filter((e) => touchedEffects.has(e.type)),
            ];
          }
          if (touchedAnimations && newAnimations) {
            const existing =
              current.tracks
                .flatMap((t) => t.clips)
                .find((c) => c.id === intent.clip_id)?.animations || [];
            intent.changes.animations = [
              ...existing.filter((a) => !touchedAnimations.has(a.property)),
              ...newAnimations.filter((a) => touchedAnimations.has(a.property)),
            ];
          }
          if (type === "add_clip") {
            const target = current.tracks.find((t) => t.id === intent.track_id);
            if (target)
              intent.clip.start_ms = intent.append
                ? Math.max(
                    0,
                    ...target.clips.map((c) => c.start_ms + c.duration_ms),
                  )
                : freeStart(
                    target,
                    intent.clip.start_ms || 0,
                    intent.clip.duration_ms || 4000,
                  );
            delete intent.append;
          }
          let resolved: { type: string; payload: unknown } = {
            type,
            payload: intent,
          };
          if (type === "inspector_update") {
            const track = current.tracks.find((t) => t.id === intent.track_id);
            const clip = track?.clips.find((c) => c.id === intent.clip_id);
            if (!track || !clip)
              throw new Error(tr("This clip is no longer available."));
            resolved = inspectorEdit(
              track,
              clip,
              intent.changes,
              assets,
              intent.animation_duration_ms,
            );
          }
          let steps: EditStep[];
          let batch = false;
          if (type === "delete_timeline_track") {
            steps = deleteTimelineTrack(
              current,
              intent.track_id,
              intent.clip_ids,
            );
            batch = true;
          } else if (type === "insert_canvas") {
            steps = canvasInsert(current, assets, intent as CanvasInsert).steps;
            batch = true;
          } else if (type === "insert_layer") {
            steps = layerInsert(current, intent.kind, intent.clip).steps;
            batch = true;
          } else if (type === "insert_source") {
            const plan = sourceInsert(current, assets, intent as SourceInsert);
            steps = plan.operations as EditStep[];
            batch = true;
            if (!intent.append && plan.start_ms !== intent.start_ms)
              setNotice(
                tr("Range inserted at the first available gap: {{time}} s.", {
                  time: (plan.start_ms / 1000).toFixed(2),
                }),
              );
          } else {
            steps = [resolved as EditStep];
          }
          return { steps, batch };
        },
      })
      .then((p) => {
        const current = before;
        const stacks = (undoStacks.current[id] ||= { undo: [], redo: [] });
        if (direction) {
          setInspectorReset((n) => n + 1);
          if (stacks[direction].at(-1) === resolvedDirectionRevision)
            stacks[direction].pop();
          stacks[direction === "undo" ? "redo" : "undo"].push(p.revision - 1);
        } else {
          stacks.undo.push(p.revision - 1);
          stacks.redo = [];
        }
        setShowRender(false);
        if (
          [
            "add_clip",
            "insert_source",
            "insert_canvas",
            "insert_layer",
          ].includes(type) &&
          useStudio.getState().projectId === id
        ) {
          const previousIds = new Set(
            current.tracks.flatMap((t) => t.clips.map((c) => c.id)),
          );
          const added = p.tracks
            .flatMap((t) => t.clips)
            .find((c) => !previousIds.has(c.id));
          if (added)
            state.set({
              selectedId: added.id,
              time: added.start_ms,
              playing: false,
            });
        }
      })
      .catch((e: Error) => {
        setInspectorReset((n) => n + 1);
        setNotice(e.message);
      });
  };
  const create = useMutation({
    ...writes.createProject(query),
    onSuccess: (p) => {
      query.setQueryData(["project", p.id], p);
      void query.invalidateQueries({ queryKey: ["projects"] });
      state.set({ projectId: p.id, page: "studio", selectedId: null, time: 0 });
      setNewOpen(false);
      setNewName("");
    },
    onError: (e) => setNotice(e.message),
  });
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
      setTab("exports");
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
    setTab("timeline");
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
  function openProject(p: Project) {
    state.set({
      projectId: p.id,
      page: "studio",
      time: 0,
      selectedId: null,
      playing: false,
    });
    setTab("timeline");
    setShowRender(false);
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
  const running = jobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  ).length;
  return (
    <div
      {...dropzone.getRootProps()}
      className={`app ${sidebar.collapsed ? "sidebar-collapsed" : ""}`}
    >
      <input
        {...dropzone.getInputProps()}
        aria-label={tr("Choose files to import")}
      />
      <aside className="sidebar" id="workspace-sidebar">
        <SidebarToggle
          collapsed={sidebar.collapsed}
          onToggle={sidebar.toggle}
        />
        <button
          className="brand"
          aria-label={tr("Projects")}
          onClick={() => state.set({ page: "projects" })}
        >
          <img
            className="brand-mark"
            src="/brand/logo-64.png"
            srcSet="/brand/logo-128.png 2x"
            width={40}
            height={40}
            alt=""
            draggable={false}
          />
          synkinema<span className="brand-dot">β</span>
        </button>
        <div className="workspace-label">
          {" "}
          {tr("YOUR WORKSPACE")} <span>{tr("LOCAL")}</span>
        </div>
        <nav>
          <button
            className={state.page === "channels" ? "active" : ""}
            aria-label={tr("Channels")}
            title={tr("Channels")}
            onClick={() =>
              state.set({
                page: "channels",
                projectId: null,
                channelId: null,
                playing: false,
              })
            }
          >
            <Radio /> {tr("Channels")}
          </button>
          <button
            className={state.page === "projects" ? "active" : ""}
            aria-label={tr("Projects")}
            title={tr("Projects")}
            onClick={() => state.set({ page: "projects" })}
          >
            <FolderOpen /> {tr("Projects")}
            <span>{projects.length.toString().padStart(2, "0")}</span>
          </button>
          <button
            className={state.page === "library" ? "active" : ""}
            aria-label={tr("Library")}
            title={tr("Library")}
            onClick={() => state.set({ page: "library" })}
          >
            <Layers /> {tr("Library")}{" "}
          </button>
          <button
            className={state.page === "renders" ? "active" : ""}
            aria-label={tr("Render queue")}
            title={tr("Render queue")}
            onClick={() => state.set({ page: "renders" })}
          >
            <Clapperboard /> {tr("Render queue")}
            {running > 0 && <span>{running}</span>}
          </button>
        </nav>
        <div className="sidebar-projects">
          <div className="workspace-label">
            {" "}
            {tr("RECENT PROJECTS")}{" "}
            <button
              onClick={() => {
                setNewChannel("");
                setNewOpen(true);
              }}
              aria-label={tr("New project")}
            >
              <Plus size={16} />
            </button>
          </div>
          {projects.slice(0, 6).map((p) => (
            <button
              key={p.id}
              className={
                state.page === "studio" && state.projectId === p.id
                  ? "project-link active"
                  : "project-link"
              }
              disabled={p.id.startsWith("pending:")}
              aria-busy={p.id.startsWith("pending:")}
              onClick={() => openProject(p)}
            >
              <span className="mini-frame">
                <Film size={15} />
              </span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="status-dot" />
            <div>
              <strong>{tr("Your studio. Locally.")}</strong>
              <small>{tr("Media stays on this device")}</small>
            </div>
          </div>
          <button
            className="settings-link"
            aria-label={tr("Settings and integrations")}
            title={tr("Settings and integrations")}
            onClick={() => state.set({ page: "settings" })}
          >
            <Settings2 size={18} /> {tr("Settings and integrations")}
            <span>{appVersion}</span>
          </button>
        </div>
      </aside>
      {manageProject && (
        <ProjectManager
          key={`${manageProject.project.id}-${manageProject.mode}`}
          {...manageProject}
          onClose={() => setManageProject(undefined)}
          onDeleted={(message) => {
            setNotice(message);
            if (state.projectId === manageProject.project.id)
              state.set({ page: "projects", projectId: null });
          }}
        />
      )}
      <main className={state.page === "studio" ? "main studio-main" : "main"}>
        {state.page === "studio" && !project ? (
          <div className="empty" role="status">
            {projectLoading ? (
              <>
                <LoaderCircle className="spin" />
                <h2>{tr("Opening project…")}</h2>
              </>
            ) : (
              <>
                <FolderOpen />
                <h2>{tr("Unable to open project")}</h2>
                <p>
                  {currentProjectError?.message ||
                    tr("This project is unavailable.")}
                </p>
                <button
                  className="button"
                  onClick={() =>
                    state.set({ page: "projects", projectId: null })
                  }
                >
                  {" "}
                  {tr("Back to projects")}{" "}
                </button>
              </>
            )}
          </div>
        ) : state.page === "studio" && project ? (
          <>
            <header className="project-header">
              <div className="breadcrumb">
                <button onClick={() => state.set({ page: "projects" })}>
                  {" "}
                  {tr("Projects")}{" "}
                </button>
                <span>/</span>
                <strong>{project.name}</strong>
                <span className="revision">r{project.revision}</span>
                <button
                  className="button subtle"
                  onClick={() => setManageProject({ project, mode: "edit" })}
                  title={tr("Edit channel assignment")}
                >
                  {project.channel_context?.channel.name ||
                    tr("Independent project")}
                </button>
                {project.channel_id && (
                  <button
                    className="icon-button"
                    aria-label={tr("Open channel brief")}
                    title={tr("Open channel brief")}
                    onClick={() =>
                      state.set({
                        page: "channels",
                        projectId: null,
                        channelId: project.channel_id,
                        playing: false,
                      })
                    }
                  >
                    <Radio size={17} />
                  </button>
                )}
              </div>
              <div className="header-actions">
                <span className="save-status">
                  {operation.isPending ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Check size={14} />
                  )}{" "}
                  {operation.isPending ? tr("Saving") : tr("Saved locally")}
                </span>
                <button
                  className="button subtle"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(project, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "synkinema-project.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <ArrowDownToLine size={16} />
                  JSON
                </button>
                <button
                  className="button primary"
                  disabled={!project.duration_ms}
                  onClick={() => setExportOpen(true)}
                >
                  <Clapperboard size={16} /> {tr("Export")}{" "}
                  <ArrowRight size={15} />
                </button>
              </div>
            </header>
            <div className="project-tabs">
              <div>
                {[
                  ["timeline", tr("Edit")],
                  ["script", tr("Script")],
                  ["audio", tr("Audio")],
                  ["exports", tr("Exports")],
                  ["history", tr("History")],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? "active" : ""}
                    onClick={() => setTab(key)}
                  >
                    {label}
                    {key === "exports" && projectJobs.length > 0 && (
                      <span>{projectJobs.length}</span>
                    )}
                  </button>
                ))}
              </div>
              <span>
                {project.profile.width} × {project.profile.height} <i />{" "}
                {project.profile.fps} FPS <i />{" "}
                {project.profile.kind.toUpperCase()}
              </span>
            </div>
            {tab === "timeline" ? (
              <>
                <EditorTop sourceOpen={!!sourceAsset}>
                  <section className="asset-panel">
                    <div className="panel-heading">
                      <h2>
                        {sourceAsset
                          ? tr("Source · {{name}}", { name: sourceAsset.name })
                          : tr("Project media")}
                      </h2>
                      <IconButton
                        label={tr("Import media")}
                        onClick={dropzone.open}
                      >
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
                  <section
                    className={`viewer ${focusPreview ? "viewer-expanded" : ""}`}
                  >
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
                        <button
                          className="text-button"
                          onClick={() => setElementOpen(true)}
                        >
                          <Plus size={15} />
                          {tr("Elements")}
                        </button>
                        <button className="text-button" onClick={addText}>
                          <Type size={15} />
                          {tr("Caption")}
                        </button>
                        {latest?.output_url && (
                          <button
                            className="text-button"
                            onClick={() => setShowRender(!showRender)}
                          >
                            {showRender
                              ? tr("Back to timeline")
                              : tr("Play export")}
                          </button>
                        )}
                        <IconButton
                          label={
                            focusPreview
                              ? tr("Close expanded preview")
                              : tr("Expand preview")
                          }
                          onClick={() => setFocusPreview(!focusPreview)}
                        >
                          {focusPreview ? (
                            <X size={16} />
                          ) : (
                            <Maximize2 size={16} />
                          )}
                        </IconButton>
                        <IconButton
                          label={tr("Inspect current frame")}
                          disabled={
                            inspectBusy ||
                            operation.isPending ||
                            !project.duration_ms
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
                      onChange={(track, clip, changes) =>
                        edit("inspector_update", {
                          track_id: track.id,
                          clip_id: clip.id,
                          changes,
                          animation_duration_ms: clip.duration_ms,
                        })
                      }
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
                        <button
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
                        </button>
                        <IconButton
                          label={tr("Go to next shot")}
                          onClick={() => {
                            const starts = project.tracks
                              .flatMap((t) => t.clips.map((c) => c.start_ms))
                              .sort((a, b) => a - b);
                            state.set({
                              time:
                                starts.find(
                                  (t) => t > useStudio.getState().time + 50,
                                ) || 0,
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
                      <h2>
                        {selected ? tr("Clip properties") : tr("Project")}
                      </h2>
                      <SlidersHorizontal size={16} />
                    </div>
                    {selected && selectedTrack ? (
                      <>
                        <div className="manual-actions">
                          <button
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
                          </button>
                          {assets.find((a) => a.id === selected.asset_id)
                            ?.has_audio &&
                            ["video", "overlay"].includes(
                              selectedTrack!.kind,
                            ) && (
                              <button
                                className="button"
                                onClick={() => {
                                  const track =
                                    project.tracks.find(
                                      (t) => t.kind === "sound",
                                    ) ||
                                    project.tracks.find(
                                      (t) => t.kind === "music",
                                    ) ||
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
                                <Volume2 size={14} />{" "}
                                {tr("Extract video audio")}{" "}
                              </button>
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
                        <button
                          className="button wide"
                          disabled={
                            inspectBusy ||
                            operation.isPending ||
                            !project.duration_ms
                          }
                          onClick={() => void inspect("sheet")}
                        >
                          <Frame size={16} /> {tr("Contact sheet")}{" "}
                        </button>
                      </div>
                    )}
                  </aside>
                </EditorTop>
                <section
                  className="timeline"
                  style={{ height: timelineHeight }}
                >
                  <div
                    className="timeline-resizer"
                    role="separator"
                    aria-label={tr("Timeline height")}
                    aria-orientation="horizontal"
                    aria-valuenow={timelineHeight}
                    aria-valuemin={280}
                    aria-valuemax={clampTimelineHeight(
                      window.innerHeight,
                      Infinity,
                    )}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        setTimelineHeight((v) =>
                          clampTimelineHeight(
                            window.innerHeight,
                            v + (e.key === "ArrowUp" ? 30 : -30),
                          ),
                        );
                      }
                    }}
                    onPointerDown={(e) => {
                      timelineResize.current = {
                        y: e.clientY,
                        height: timelineHeight,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      const drag = timelineResize.current;
                      if (drag)
                        setTimelineHeight(
                          clampTimelineHeight(
                            window.innerHeight,
                            drag.height + drag.y - e.clientY,
                          ),
                        );
                    }}
                    onPointerUp={() => {
                      timelineResize.current = null;
                    }}
                    onPointerCancel={() => {
                      timelineResize.current = null;
                    }}
                  />
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
                      <button
                        className="text-button"
                        onClick={() => setTrackOpen(true)}
                      >
                        <Plus size={16} /> {tr("Track")}{" "}
                      </button>
                      <button className="text-button" onClick={addText}>
                        <Type size={16} /> {tr("Add caption")}{" "}
                      </button>
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
                    onEdit={edit}
                  />
                </section>
              </>
            ) : tab === "script" ? (
              <ScriptEditor
                key={`${project.id}-${project.revision}`}
                project={project}
                save={(p) => edit("update_project", p)}
              />
            ) : tab === "audio" ? (
              <div className="content-page">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">{tr("MIX CONTROL")}</span>
                    <h1>{tr("Give every sound its space.")}</h1>
                    <p>
                      {" "}
                      {tr(
                        "Measure loudness, peak levels and silence in the rendered mix.",
                      )}{" "}
                    </p>
                  </div>
                  <button
                    className="button primary"
                    disabled={
                      inspectBusy || operation.isPending || !project.duration_ms
                    }
                    onClick={() => void inspect("audio")}
                  >
                    {inspectBusy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Activity size={17} />
                    )}{" "}
                    {tr("Analyze mix")}{" "}
                  </button>
                </div>
                <div className="audio-tracks">
                  {project.tracks
                    .filter((t) =>
                      ["voiceover", "music", "sound", "ambient"].includes(
                        t.kind,
                      ),
                    )
                    .map((t) => (
                      <div className="audio-track" key={t.id}>
                        <Music2 />
                        <div>
                          <strong>{t.name}</strong>
                          <small>
                            {tr("clipCount", { count: t.clips.length })} ·{" "}
                            {trackKindLabel(t.kind)}
                          </small>
                        </div>
                        <label>
                          <input
                            type="checkbox"
                            checked={t.ducking}
                            disabled={t.kind !== "music"}
                            onChange={(e) =>
                              edit("update_track", {
                                track_id: t.id,
                                changes: { ducking: e.target.checked },
                              })
                            }
                          />{" "}
                          {tr("Duck under voiceover")}{" "}
                        </label>
                        <IconButton
                          label={
                            t.muted ? tr("Unmute track") : tr("Mute track")
                          }
                          onClick={() =>
                            edit("update_track", {
                              track_id: t.id,
                              changes: { muted: !t.muted },
                            })
                          }
                        >
                          {t.muted ? (
                            <VolumeX size={18} />
                          ) : (
                            <Volume2 size={18} />
                          )}
                        </IconButton>
                      </div>
                    ))}
                </div>
                {audio ? (
                  <AudioView report={audio} />
                ) : (
                  <div className="empty">
                    <Activity size={40} />
                    <h3>{tr("Hear the difference. See the measurements.")}</h3>
                    <p>
                      {" "}
                      {tr("Target {{lufs}} LUFS and maximum {{peak}} dBTP.", {
                        lufs: project.profile.target_lufs,
                        peak: project.profile.true_peak,
                      })}
                      <br />{" "}
                      {tr(
                        "Analysis uses FFmpeg EBU R128 and 500 ms samples.",
                      )}{" "}
                    </p>
                  </div>
                )}
              </div>
            ) : tab === "exports" ? (
              <RenderQueue
                key={project.id}
                jobs={projectJobs}
                projectId={project.id}
              />
            ) : (
              <div className="content-page">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">
                      {" "}
                      {tr("EVERY CHANGE HAS A HISTORY")}{" "}
                    </span>
                    <h1>{tr("Project revisions")}</h1>
                    <p>
                      {" "}
                      {tr(
                        "Restoring creates a new revision. Source media remains unchanged.",
                      )}{" "}
                    </p>
                  </div>
                </div>
                <div className="history-list">
                  {history.map((h) => (
                    <div key={h.revision}>
                      <span className="history-number">
                        {h.revision.toString().padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{operationLabel(h.operation)}</strong>
                        <small>
                          {new Date(h.created_at).toLocaleString(
                            i18n.resolvedLanguage || "en",
                          )}
                        </small>
                      </div>
                      {h.revision === project.revision ? (
                        <span className="badge">{tr("Current")}</span>
                      ) : (
                        <button
                          className="button"
                          disabled={operation.isPending}
                          onClick={() =>
                            edit("restore_revision", { revision: h.revision })
                          }
                        >
                          {" "}
                          {tr("Restore")}{" "}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <h2>{tr("Review notes")}</h2>
                {reviews.map((r) => (
                  <div className="review" key={r.id}>
                    <span>
                      {timecode(r.time_ms)} · r{r.revision}
                    </span>
                    <p>{r.message}</p>
                    {!r.resolved && !r.id.startsWith("pending:") && (
                      <button
                        className="text-button"
                        onClick={() =>
                          resolveComment.mutate({
                            projectId: project.id,
                            commentId: r.id,
                          })
                        }
                      >
                        {" "}
                        {tr("Mark as resolved")}{" "}
                      </button>
                    )}
                  </div>
                ))}
                <form
                  className="comment-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem(
                      "comment",
                    ) as HTMLInputElement;
                    const submitted = input.value;
                    addComment.mutate(
                      {
                        projectId: project.id,
                        request: {
                          revision: project.revision,
                          time_ms: Math.round(useStudio.getState().time),
                          message: submitted,
                        },
                      },
                      {
                        onSuccess: () => {
                          if (input.value === submitted) input.value = "";
                        },
                      },
                    );
                  }}
                >
                  <input
                    name="comment"
                    required
                    placeholder={tr("Add a review note…")}
                  />
                  <button className="button">{tr("Add note")}</button>
                </form>
              </div>
            )}
          </>
        ) : state.page === "channels" ? (
          <Channels
            channelId={state.channelId}
            onSelect={(channelId) =>
              state.set({ page: "channels", projectId: null, channelId })
            }
            onProject={(projectId) =>
              state.set({
                page: "studio",
                projectId,
                selectedId: null,
                time: 0,
                playing: false,
              })
            }
            onNewProject={(channelId) => {
              setNewChannel(channelId);
              setNewName("");
              setNewOpen(true);
            }}
          />
        ) : state.page === "library" ? (
          <>
            <PageHeader
              eyebrow={tr("ONE LIBRARY. MANY STORIES.")}
              title={tr("Your media")}
              description={tr("Media ready to reuse in every project.")}
              action={
                <button className="button primary" onClick={dropzone.open}>
                  <Upload size={17} /> {tr("Import to shared library")}{" "}
                </button>
              }
            />
            <div className="content-page organized-library">
              <MediaLibrary
                onDestination={setMediaDestination}
                onNotice={setNotice}
              />
            </div>
          </>
        ) : state.page === "renders" ? (
          <>
            <PageHeader
              eyebrow={tr("FROM TIMELINE TO FINISHED VIDEO")}
              title={tr("Render queue")}
              description={tr(
                "Every export is tied to a specific project revision.",
              )}
            />
            <RenderQueue key="all-renders" jobs={jobs} />
          </>
        ) : state.page === "settings" ? (
          <>
            <PageHeader
              eyebrow={tr("LOCAL. UNDER YOUR CONTROL.")}
              title={tr("Engine and integrations")}
              description={tr(
                "Web Studio, REST and MCP share the same project database.",
              )}
            />
            <div className="content-page settings-grid">
              <div className="setting-card">
                <Clapperboard />
                <h2>{tr("FFmpeg Engine")}</h2>
                <p>
                  {" "}
                  {tr(
                    "Native H.264 + AAC rendering. Clip caching, two-pass loudness normalization and bounded thread usage.",
                  )}{" "}
                </p>
                <span className="badge">{tr("LOCAL RENDERER")}</span>
              </div>
              <div className="setting-card">
                <Sparkles />
                <h2>{tr("MCP agent")}</h2>
                <p>
                  {" "}
                  {tr(
                    "Connect an agent to this studio to edit the timeline, render videos and inspect exported frames.",
                  )}{" "}
                </p>
                <code>http://localhost:8080/mcp/</code>
                <button
                  className="button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText("http://localhost:8080/mcp/")
                      .then(() => setNotice(tr("MCP address copied")))
                  }
                >
                  <Copy size={15} /> {tr("Copy address")}{" "}
                </button>
              </div>
              <div className="setting-card agent-instructions-card">
                <Radio />
                <h2>{tr("Agent workflow instructions")}</h2>
                <p>
                  {tr(
                    "Copy this ready-to-use instruction when handing a Synkinema task to an agent. It identifies the MCP endpoint, safe discovery steps and the required revision-aware workflow.",
                  )}
                </p>
                <pre className="agent-instructions-preview">
                  {agentInstructionsPrompt()}
                </pre>
                <AgentPromptCopyButton
                  prompt={agentInstructionsPrompt()}
                  onNotice={setNotice}
                  label={tr("Copy agent instructions")}
                />
              </div>
              <div className="setting-card">
                <Layers />
                <h2>{tr("REST API")}</h2>
                <p>
                  {" "}
                  {tr(
                    "Typed operations, revision checks and OpenAPI documentation.",
                  )}{" "}
                </p>
                <a
                  className="button"
                  href="/api/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  {" "}
                  {tr("Open documentation")} <ArrowRight size={16} />
                </a>
              </div>
              <div className="setting-card">
                <Mic />
                <h2>{tr("Voiceover")}</h2>
                <p>
                  {" "}
                  {tr(
                    "Import a WAV, MP3 or M4A recording and add it to a voiceover track. Text-to-speech providers are optional.",
                  )}{" "}
                </p>
                <button className="button" onClick={dropzone.open}>
                  {" "}
                  {tr("Import audio")}{" "}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <PageHeader
              eyebrow={tr("YOUR IDEAS IN MOTION")}
              title={tr("Room for a great story.")}
              description={tr(
                "From the first frame to the last sound. Everything in one place.",
              )}
              action={
                <button
                  className="button primary"
                  onClick={() => {
                    setNewChannel("");
                    setNewOpen(true);
                  }}
                >
                  <Plus size={18} /> {tr("New project")}{" "}
                </button>
              }
            />
            <div className="content-page">
              <div className="project-list-heading">
                <h2>
                  {" "}
                  {tr("Projects")}{" "}
                  <span>{projects.length.toString().padStart(2, "0")}</span>
                </h2>
                <span> {tr("Date created · Newest first")}</span>
              </div>
              {projectError && (
                <div className="error-banner">
                  {" "}
                  {tr("Unable to load projects: {{error}}", {
                    error: projectError.message,
                  })}
                </div>
              )}
              {coverAssetsError && (
                <div role="alert" className="error-banner">
                  {tr("Unable to load project thumbnails: {{error}}", {
                    error: coverAssetsError.message,
                  })}
                </div>
              )}
              <div className="projects-grid">
                {projectsByCreatedAt(projects).map((p, i) => {
                  return (
                    <article
                      className="project-card"
                      key={p.id}
                      aria-busy={p.id.startsWith("pending:")}
                    >
                      <button
                        className="project-open"
                        disabled={p.id.startsWith("pending:")}
                        onClick={() => openProject(p)}
                        aria-label={tr("Open project {{name}}", {
                          name: p.name,
                        })}
                      >
                        <div className={`project-cover cover-${i % 3}`}>
                          <ProjectThumbnail project={p} assets={coverAssets} />
                          <span className="format-chip">
                            {p.profile.kind.toUpperCase()} ·{" "}
                            {p.profile.width > p.profile.height
                              ? "16:9"
                              : p.profile.width === p.profile.height
                                ? "1:1"
                                : "9:16"}
                          </span>
                          <span className="cover-play">
                            <Play size={22} />
                          </span>
                          <div className="cover-title">{p.name}</div>
                        </div>
                        <div className="project-card-info">
                          <h3>{p.name}</h3>
                          <ArrowRight size={19} />
                          <div>
                            <span>
                              {seconds(p.duration_ms)} <i />{" "}
                              {tr("clipCount", {
                                count: p.tracks.reduce<number>(
                                  (s, t) => s + t.clips.length,
                                  0,
                                ),
                              })}{" "}
                            </span>
                            <span>r{p.revision}</span>
                          </div>
                        </div>
                      </button>
                      <div className="project-card-actions">
                        <AgentPromptCopyButton
                          className="text-button"
                          prompt={projectAgentPrompt(p)}
                          onNotice={setNotice}
                          label={tr("Copy prompt")}
                          ariaLabel={tr("Copy project agent prompt")}
                        />
                        <button
                          className="text-button"
                          disabled={
                            p.id.startsWith("pending:") || operation.isPending
                          }
                          onClick={() =>
                            setManageProject({ project: p, mode: "edit" })
                          }
                          aria-label={tr("Edit project {{name}}", {
                            name: p.name,
                          })}
                        >
                          <Pencil size={15} />
                          {tr("Edit")}
                        </button>
                        <button
                          className="text-button danger-text"
                          disabled={
                            p.id.startsWith("pending:") || operation.isPending
                          }
                          onClick={() =>
                            setManageProject({ project: p, mode: "delete" })
                          }
                          aria-label={tr("Delete project {{name}}", {
                            name: p.name,
                          })}
                        >
                          <Trash2 size={15} />
                          {tr("Delete")}
                        </button>
                      </div>
                    </article>
                  );
                })}
                <button
                  className="new-project-card"
                  onClick={() => {
                    setNewChannel("");
                    setNewOpen(true);
                  }}
                >
                  <span>
                    <Plus size={25} />
                  </span>
                  <h3>{tr("Start a new story")}</h3>
                  <p>{tr("Video, reel, short — your choice.")}</p>
                </button>
              </div>
              <div className="studio-note">
                <span className="note-icon">
                  <WandSparkles size={25} />
                </span>
                <div>
                  <h3>{tr("Create with an agent.")}</h3>
                  <p>
                    {" "}
                    {tr(
                      "The same project. The same timeline. Edit manually or connect an agent through MCP.",
                    )}{" "}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => state.set({ page: "settings" })}
                >
                  {" "}
                  {tr("View integrations")} <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
      <Modal
        open={trackOpen}
        onOpenChange={setTrackOpen}
        title={tr("New track")}
      >
        <label className="field">
          {" "}
          {tr("Track name")}{" "}
          <input
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            placeholder={tr("e.g. Camera audio")}
          />
        </label>
        <label className="field">
          {" "}
          {tr("Track type")}{" "}
          <select
            value={trackKind}
            onChange={(e) => setTrackKind(e.target.value)}
          >
            <option value="overlay">{tr("Video overlay")}</option>
            <option value="text">{tr("Captions")}</option>
            <option value="sound">{tr("Audio")}</option>
            <option value="music">{tr("Music")}</option>
            <option value="voiceover">{tr("Voiceover")}</option>
            <option value="ambient">{tr("Ambience")}</option>
          </select>
        </label>
        <button
          className="button primary wide"
          disabled={!trackName.trim()}
          onClick={() => {
            edit("add_track", { name: trackName.trim(), kind: trackKind });
            setTrackOpen(false);
            setTrackName("");
          }}
        >
          {" "}
          {tr("Add track")}{" "}
        </button>
      </Modal>
      <ElementPicker
        open={elementOpen}
        onOpenChange={setElementOpen}
        onInsert={insertVisual}
      />
      <Modal
        open={captionOpen}
        onOpenChange={setCaptionOpen}
        title={tr("Add caption")}
      >
        <CaptionStyles value={captionStyle} onChange={setCaptionStyle} />
        <button
          className="button primary wide"
          onClick={() => {
            insertCaption();
            setCaptionOpen(false);
          }}
        >
          {tr("Add caption")}
        </button>
      </Modal>
      <Modal open={newOpen} onOpenChange={setNewOpen} title={tr("New story")}>
        {exportCatalog.isError && (
          <p role="alert">
            {exportCatalog.error.message}{" "}
            <button onClick={() => void exportCatalog.refetch()}>
              {tr("Try again")}
            </button>
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              name: newName.trim(),
              channel_id: newChannel || null,
              profile: (() => {
                const preset = exportCatalog.data!.presets.find(
                  (p) => p.id === newFormat,
                )!;
                return {
                  name: `${preset.name} · ${preset.resolution}`,
                  kind: preset.kind,
                  width: preset.width,
                  height: preset.height,
                };
              })(),
            });
          }}
        >
          <label className="field">
            {" "}
            {tr("Project name")}{" "}
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tr("What story will you tell?")}
              required
              maxLength={200}
            />
          </label>
          <label className="field">
            {" "}
            {tr("Format")}{" "}
            <select
              value={newFormat}
              onChange={(e) => setNewFormat(e.target.value)}
            >
              {["9:16", "16:9", "1:1", "4:5"].map((aspect) => (
                <optgroup key={aspect} label={formatLabel(aspect)}>
                  {exportCatalog.data?.presets
                    .filter((p) => p.aspect === aspect)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.resolution} · {p.width} × {p.height}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <ChannelSelect
            value={newChannel}
            onChange={setNewChannel}
            disabled={create.isPending}
          />
          <button
            className="button primary wide"
            disabled={
              create.isPending || !newName.trim() || !exportCatalog.data
            }
          >
            {create.isPending ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}{" "}
            {tr("Create project")}{" "}
          </button>
        </form>
      </Modal>
      <Modal
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={tr("Your story is ready to export")}
      >
        <p className="muted">
          {tr("{{name}} · revision {{revision}}", {
            name: project?.name,
            revision: project?.revision,
          })}
        </p>
        {project && (
          <ExportSettings
            key={project.id}
            project={project}
            busy={render.isPending || operation.isPending}
            onExport={(request) => render.mutate({ project, request })}
          />
        )}
      </Modal>
      <Modal
        open={!!inspection}
        onOpenChange={() => setInspection(null)}
        title={tr("Render inspection")}
      >
        {inspection && (
          <img
            className="inspection-image"
            src={inspection}
            alt={tr("Actual rendered video frames")}
          />
        )}
      </Modal>
      {notice && (
        <div role="status" className="toast">
          <span>{notice}</span>
          <button
            aria-label={tr("Dismiss notification")}
            onClick={() => setNotice("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {dropzone.isDragActive && (
        <div className="drop-overlay">
          <Upload size={48} />
          <h2>{tr("Drop media here")}</h2>
          <p>{tr("Files are added to the selected media collection.")}</p>
        </div>
      )}
    </div>
  );
}
function AudioView({ report }: { report: AudioReport }) {
  useLocale();
  return (
    <div className="audio-report">
      <div className="metrics">
        <div>
          <span>{tr("Integrated loudness")}</span>
          <strong>
            {report.integrated_lufs ?? "—"}
            <small>LUFS</small>
          </strong>
        </div>
        <div>
          <span>{tr("True peak")}</span>
          <strong>
            {report.true_peak_dbtp ?? "—"}
            <small>dBTP</small>
          </strong>
        </div>
        <div>
          <span>{tr("Loudness range")}</span>
          <strong>
            {report.loudness_range ?? "—"}
            <small>LU</small>
          </strong>
        </div>
      </div>
      <img src={report.map_url} alt={tr("Mix loudness in 500 ms windows")} />
      <audio controls src={report.audio_url} />
      {report.warnings.length ? (
        report.warnings.map((w) => (
          <p className="warning" key={w.type}>
            {w.message}
          </p>
        ))
      ) : (
        <p className="success">
          <Check size={16} />{" "}
          {tr("The mix is within the loudness profile tolerance.")}{" "}
        </p>
      )}
    </div>
  );
}
function ScriptEditor({
  project,
  save,
}: {
  project: Project;
  save: (p: unknown) => void;
}) {
  useLocale();
  const query = useQueryClient();
  const [downloadError, setDownloadError] = useState("");

  const [script, setScript] = useState(project.script);
  const [brief, setBrief] = useState(project.brief);
  return (
    <div className="content-page script-page">
      <div className="section-title">
        <div>
          <span className="eyebrow">{tr("STORY FIRST")}</span>
          <h1>{tr("Script and scenes")}</h1>
        </div>
        <button
          className="button primary"
          onClick={() => save({ script, brief })}
        >
          <Check size={16} /> {tr("Save script")}{" "}
        </button>
      </div>
      <label className="field">
        {" "}
        {tr("Brief")}{" "}
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder={tr("Goal, audience, emotion, direction…")}
        />
      </label>
      <label className="field">
        {" "}
        {tr("Script")}{" "}
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={10}
          placeholder={tr("Write your narration and shot ideas…")}
        />
      </label>
      <VoiceGenerator text={script} projectId={project.id} />
      <div className="scene-list">
        {project.scenes.map((s, i) => (
          <div key={s.id}>
            <span>{(i + 1).toString().padStart(2, "0")}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.narration}</p>
              <small>{s.notes}</small>
            </div>
            <small>
              {timecode(s.start_ms)} · {seconds(s.duration_ms)}
            </small>
          </div>
        ))}
      </div>
      <button
        className="button"
        onClick={() => {
          setDownloadError("");
          void query
            .fetchQuery(reads.captions(project.id, project.revision))
            .then((text) => downloadText(text, "captions.srt"))
            .catch((e) => setDownloadError(e.message));
        }}
      >
        <ArrowDownToLine size={16} /> {tr("Download SRT subtitles")}
      </button>
      {downloadError && <p role="alert">{downloadError}</p>}
    </div>
  );
}
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
  const visual = project.tracks
    .filter((t) => !t.muted && ["video", "overlay", "text"].includes(t.kind))
    .sort((a, b) => Number(b.kind === "video") - Number(a.kind === "video"))
    .flatMap((t) => t.clips.map((c) => ({ track: t, clip: c })))
    .filter(
      ({ clip: c }) =>
        state.time >= c.start_ms && state.time < c.start_ms + c.duration_ms,
    );
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
            {visual.map(({ track, clip: original }, index) => {
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
                  key={clip.id}
                  className="preview-composition-layer"
                  style={{ zIndex: index + 1 }}
                >
                  {track.kind === "text" ? (
                    <CaptionPreview
                      project={project}
                      clip={original}
                      opacity={opacity}
                      imageStyle={(rasterClip) => ({
                        transform: `translate(${(clip.text_x - rasterClip.text_x) * canvasSize.width}px, ${(clip.text_y - rasterClip.text_y) * canvasSize.height}px) scale(${clip.font_size / rasterClip.font_size})`,
                        transformOrigin: `${rasterClip.text_x * 100}% ${rasterClip.text_y * 100}%`,
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
      <div className="preview-workspace-tools">
        <ZoomOut size={13} aria-hidden="true" />
        <select
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
        </select>
      </div>
    </div>
  );
}
function ClipInspector({
  clip: c,
  track,
  onChange,
  onRemove,
}: {
  clip: Clip;
  track: Track;
  onChange: (v: Partial<Clip>) => void;
  onRemove: () => void;
}) {
  useLocale();
  const visual = ["video", "overlay"].includes(track.kind);
  const effectValue = (type: string) =>
    c.effects.find((e) => e.type === type && e.enabled)?.value ??
    (type === "contrast" || type === "saturation" ? 1 : 0);
  const effect = (type: Clip["effects"][number]["type"], value: number) =>
    onChange({
      effects: [
        ...c.effects.filter((e) => e.type !== type),
        { type, value, enabled: true },
      ],
    });
  return (
    <div className="inspector-body">
      <div className="clip-type">
        <span className={`clip-color ${track.kind}`} />
        {track.name}
        <span>{c.id.slice(0, 6)}</span>
      </div>
      <label className="field">
        {" "}
        {tr("Name")}{" "}
        <input
          defaultValue={c.name}
          onBlur={(e) =>
            e.target.value !== c.name && onChange({ name: e.target.value })
          }
        />
      </label>
      <div className="field-grid">
        <NumberField
          label={tr("Start")}
          value={c.start_ms / 1000}
          min={0}
          step={0.1}
          suffix="s"
          onChange={(v) => onChange({ start_ms: Math.round(v * 1000) })}
        />
        <NumberField
          label={tr("Duration")}
          value={c.duration_ms / 1000}
          min={0.1}
          step={0.1}
          suffix="s"
          onChange={(v) => onChange({ duration_ms: Math.round(v * 1000) })}
        />
      </div>
      {visual && <PlacementControls clip={c} onChange={onChange} />}
      {track.kind === "text" ? (
        <>
          <h3 className="inspector-section">
            <Type size={15} /> {tr("Text")}{" "}
          </h3>
          <CaptionStyles
            value={c.caption_style}
            onChange={(caption_style) => onChange({ caption_style })}
          />
          <NumberField
            label={tr("X position")}
            value={c.text_x ?? 0.09}
            min={0}
            max={0.9}
            step={0.01}
            onChange={(text_x) => onChange({ text_x })}
          />
          <label className="field">
            {" "}
            {tr("Heading")}{" "}
            <textarea
              defaultValue={c.text}
              rows={3}
              onBlur={(e) =>
                e.target.value !== c.text && onChange({ text: e.target.value })
              }
            />
          </label>
          <label className="field">
            {" "}
            {tr("Subtitle")}{" "}
            <textarea
              defaultValue={c.subtitle}
              rows={2}
              onBlur={(e) =>
                e.target.value !== c.subtitle &&
                onChange({ subtitle: e.target.value })
              }
            />
          </label>
          <div className="field-grid">
            <NumberField
              label={tr("Size")}
              value={c.font_size}
              min={16}
              max={200}
              onChange={(v) => onChange({ font_size: v })}
            />
            <NumberField
              label={tr("Y position")}
              value={c.text_y}
              min={0.1}
              max={0.85}
              step={0.01}
              onChange={(v) => onChange({ text_y: v })}
            />
          </div>
          <label className="field">
            {" "}
            {tr("Accent color")}{" "}
            <input
              type="color"
              defaultValue={c.color}
              onBlur={(e) => onChange({ color: e.target.value })}
            />
          </label>
        </>
      ) : c.shape ? (
        <>
          <label className="field">
            {tr("Shape color")}
            <input
              type="color"
              defaultValue={c.color}
              onBlur={(e) => onChange({ color: e.target.value })}
            />
          </label>
          <NumberField
            label={tr("Rotation")}
            value={c.transform.rotation}
            min={-180}
            max={180}
            onChange={(rotation) =>
              onChange({ transform: { ...c.transform, rotation } })
            }
          />
        </>
      ) : visual ? (
        <>
          <p className="hint">
            {" "}
            {tr(
              "Video tracks play without sound. Drag this clip onto an audio track or choose “Extract video audio” to edit its sound separately.",
            )}{" "}
          </p>
          <h3 className="inspector-section">
            <Maximize2 size={15} /> {tr("Transform")}{" "}
          </h3>
          <div className="field-grid">
            <NumberField
              label={tr("Scale")}
              value={c.transform.scale}
              min={1}
              max={4}
              step={0.05}
              suffix="×"
              onChange={(v) =>
                onChange({ transform: { ...c.transform, scale: v } })
              }
            />
            <NumberField
              label={tr("Rotation")}
              value={c.transform.rotation}
              min={-180}
              max={180}
              suffix="°"
              onChange={(v) =>
                onChange({ transform: { ...c.transform, rotation: v } })
              }
            />
            <NumberField
              label={tr("Crop anchor X")}
              value={c.transform.x}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) =>
                onChange({ transform: { ...c.transform, x: v } })
              }
            />
            <NumberField
              label={tr("Crop anchor Y")}
              value={c.transform.y}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) =>
                onChange({ transform: { ...c.transform, y: v } })
              }
            />
          </div>
          <label className="field">
            {" "}
            {tr("Fit")}{" "}
            <select
              value={c.transform.fit}
              onChange={(e) =>
                onChange({
                  transform: {
                    ...c.transform,
                    fit: e.target.value as "cover" | "contain",
                  },
                })
              }
            >
              <option value="cover">{tr("Fill frame")}</option>
              <option value="contain">{tr("Fit in frame")}</option>
            </select>
          </label>
          <h3 className="inspector-section">
            <WandSparkles size={15} /> {tr("Motion")}{" "}
          </h3>
          <button
            className={`button wide ${c.animations.some((a) => a.property === "scale") ? "selected" : ""}`}
            aria-pressed={c.animations.some((a) => a.property === "scale")}
            title={tr("Toggle animated zoom from the current scale")}
            onClick={() =>
              onChange({
                animations: c.animations.some((a) => a.property === "scale")
                  ? c.animations.filter((a) => a.property !== "scale")
                  : [
                      ...c.animations,
                      {
                        property: "scale",
                        keyframes: [
                          {
                            time_ms: 0,
                            value: c.transform.scale,
                            easing: "linear",
                          },
                          {
                            time_ms: c.duration_ms,
                            value: Math.min(4, c.transform.scale * 1.16),
                            easing: "ease_in_out",
                          },
                        ],
                      },
                    ],
              })
            }
          >
            <ZoomIn size={15} /> {tr("Smooth zoom")}{" "}
            {c.animations.some((a) => a.property === "scale") && (
              <Check size={15} />
            )}
          </button>
          {!!c.animations.length && (
            <button
              className="text-button"
              onClick={() => onChange({ animations: [] })}
            >
              {" "}
              {tr("Remove all animations")}{" "}
            </button>
          )}
          <h3 className="inspector-section">
            <SlidersHorizontal size={15} /> {tr("Video effects")}{" "}
          </h3>
          <div className="field-grid">
            <NumberField
              label={tr("Blur")}
              value={effectValue("blur")}
              min={0}
              max={30}
              onChange={(v) => effect("blur", v)}
            />
            <NumberField
              label={tr("Contrast")}
              value={effectValue("contrast")}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => effect("contrast", v)}
            />
            <NumberField
              label={tr("Saturation")}
              value={effectValue("saturation")}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => effect("saturation", v)}
            />
            <NumberField
              label={tr("Brightness")}
              value={effectValue("brightness")}
              min={-1}
              max={1}
              step={0.05}
              onChange={(v) => effect("brightness", v)}
            />
          </div>
          <div className="field-grid">
            <NumberField
              label={tr("Black and white")}
              value={effectValue("grayscale")}
              min={0}
              max={1}
              step={0.1}
              onChange={(v) => effect("grayscale", v)}
            />
            <NumberField
              label={tr("Vignette")}
              value={effectValue("vignette")}
              min={0}
              max={1}
              step={0.1}
              onChange={(v) => effect("vignette", v)}
            />
            <NumberField
              label={tr("Sharpen")}
              value={effectValue("sharpen")}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => effect("sharpen", v)}
            />
          </div>
          <h3 className="inspector-section">
            <Layers size={15} /> {tr("Clip entrance")}{" "}
          </h3>
          <label className="field">
            {" "}
            {tr("Transition")}{" "}
            <select
              value={c.transition.type}
              onChange={(e) =>
                onChange({
                  transition: {
                    type: e.target.value as Clip["transition"]["type"],
                    duration_ms: c.transition.duration_ms || 300,
                  },
                })
              }
            >
              {[
                ["cut", tr("Cut")],
                ["crossfade", tr("Dissolve")],
                ["fade_black", tr("Fade through black")],
                ["slide", tr("Slide")],
                ["wipe", tr("Wipe")],
                ["zoom", tr("Zoom")],
                ["blur", tr("Blur")],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {c.transition.type !== "cut" && (
            <>
              <NumberField
                label={tr("Transition duration")}
                value={c.transition.duration_ms}
                min={50}
                max={2000}
                step={50}
                suffix="ms"
                onChange={(v) =>
                  onChange({ transition: { ...c.transition, duration_ms: v } })
                }
              />
              <p className="hint">
                {" "}
                {tr(
                  "Following clips, captions and audio shift together. The transition automatically connects this clip to the previous one.",
                )}{" "}
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <h3 className="inspector-section">
            <Volume2 size={15} /> {tr("Audio level")}{" "}
          </h3>
          <NumberField
            label={tr("Gain")}
            value={c.gain_db}
            min={-60}
            max={12}
            suffix="dB"
            onChange={(v) => onChange({ gain_db: v })}
          />
          <div className="gain-meter">
            <span style={{ width: `${((c.gain_db + 60) / 72) * 100}%` }} />
          </div>
        </>
      )}
      {track.kind !== "text" && !c.shape && (
        <div className="field-grid">
          <NumberField
            label={tr("Speed")}
            value={c.speed}
            min={0.25}
            max={4}
            step={0.05}
            suffix="×"
            onChange={(v) => onChange({ speed: v })}
          />
          <NumberField
            label={tr("Source start")}
            value={c.source_in_ms / 1000}
            min={0}
            step={0.1}
            suffix="s"
            onChange={(v) => onChange({ source_in_ms: Math.round(v * 1000) })}
          />
        </div>
      )}
      <div className="field-grid">
        <NumberField
          label={tr("Fade in")}
          value={c.fade_in_ms}
          min={0}
          max={c.duration_ms}
          step={1}
          suffix="ms"
          onChange={(v) => onChange({ fade_in_ms: v })}
        />
        <NumberField
          label={tr("Fade out")}
          value={c.fade_out_ms}
          min={0}
          max={c.duration_ms}
          step={1}
          suffix="ms"
          onChange={(v) => onChange({ fade_out_ms: v })}
        />
      </div>
      {(visual || track.kind === "text") && (
        <NumberField
          label={tr("Opacity")}
          value={c.transform.opacity * 100}
          min={0}
          max={100}
          suffix="%"
          onChange={(opacity) =>
            onChange({ transform: { ...c.transform, opacity: opacity / 100 } })
          }
        />
      )}
      <button className="button danger wide" onClick={onRemove}>
        <Trash2 size={15} /> {tr("Delete clip")}{" "}
      </button>
    </div>
  );
}

function CurrentTime() {
  const time = useStudio((s) => Math.floor(s.time / 100) * 100);
  return <>{timecode(time)}</>;
}
