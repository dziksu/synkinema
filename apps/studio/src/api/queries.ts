import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { http } from "./transport";
import { guardedRead, isOptimistic } from "./cache";
import type {
  AudioRequest,
  FrameRequest,
  SheetRequest,
  TextLayerRequest,
  StateSnapshot,
  RenderRequestInput,
} from "./generated/client";

export const keys = {
  channels: ["channels"] as const,
  channel: (id: string | null) => ["channel", id] as const,
  projects: ["projects"] as const,
  exportPresets: ["export-presets"] as const,
  exportPlan: (projectId: string, request: RenderRequestInput) =>
    ["export-plan", projectId, request] as const,
  voiceStatus: ["voice-status"] as const,
  project: (id: string | null) => ["project", id] as const,
  assets: (projectId?: string | null) =>
    ["assets", projectId || "library"] as const,
  folders: (projectId?: string | null) =>
    ["asset-folders", projectId || "library"] as const,
  jobs: ["jobs"] as const,
  projectJobs: (id: string) => ["jobs", id] as const,
  cleanup: ["storage-cleanup"] as const,
  inventory: ["assets", "inventory"] as const,
  assetUsage: (id: string) => ["asset-usage", id] as const,
  reviews: (id: string | null) => ["reviews", id] as const,
  history: (id: string | null, revision?: number) =>
    ["history", id, revision] as const,
};
const id = encodeURIComponent;
export const reads = {
  channels: (client: QueryClient) =>
    queryOptions({
      queryKey: keys.channels,
      queryFn: ({ signal }) =>
        guardedRead(client, keys.channels, () =>
          http.api.listChannels({ signal }),
        ),
      refetchInterval: 10000,
    }),
  channel: (client: QueryClient, channelId: string | null) =>
    queryOptions({
      queryKey: keys.channel(channelId),
      queryFn: ({ signal }) =>
        guardedRead(client, keys.channel(channelId), () =>
          http.api.getChannel(id(channelId!), { signal }),
        ),
      enabled: !!channelId,
      refetchInterval: 10000,
    }),
  exportPresets: () =>
    queryOptions({
      queryKey: keys.exportPresets,
      queryFn: ({ signal }) => http.api.exportPresets({ signal }),
      staleTime: Infinity,
    }),
  exportPlan: (projectId: string, request: RenderRequestInput) =>
    queryOptions({
      queryKey: keys.exportPlan(projectId, request),
      queryFn: ({ signal }) =>
        http.api.planExport(projectId, request, { signal }),
      staleTime: Infinity,
    }),
  inventory: (client: QueryClient) =>
    queryOptions({
      queryKey: keys.inventory,
      queryFn: ({ signal }) =>
        guardedRead(client, keys.inventory, () =>
          http.api.assetInventory({ signal }),
        ),
      refetchInterval: 10000,
    }),
  assetUsage: (assetId: string) =>
    queryOptions({
      queryKey: keys.assetUsage(assetId),
      queryFn: ({ signal }) => http.api.assetUsage(assetId, { signal }),
      staleTime: 5000,
      refetchInterval: 10000,
    }),
  cleanup: () =>
    queryOptions({
      queryKey: keys.cleanup,
      queryFn: ({ signal }) => http.api.cleanupStatus({ signal }),
      refetchInterval: 5000,
    }),
  projects: (client: QueryClient) =>
    queryOptions({
      queryKey: keys.projects,
      refetchInterval: 10000,
      queryFn: ({ signal }) =>
        guardedRead(client, keys.projects, () => http.api.projects({ signal })),
    }),
  project: (
    client: QueryClient,
    projectId: string | null,
    revision?: number,
  ) => {
    const key =
      revision === undefined
        ? keys.project(projectId)
        : [...keys.project(projectId), revision];
    return queryOptions({
      queryKey: key,
      queryFn: ({ signal }) =>
        guardedRead(client, key, () =>
          http.api.project(id(projectId!), { revision }, { signal }),
        ),
      enabled: !!projectId,
      // Timelines can be pinned; attached editorial guidance always stays live.
      refetchInterval: 10000,
      ...(revision !== undefined ? { staleTime: 10000 } : {}),
    });
  },
  assets: (client: QueryClient, projectId?: string | null) =>
    queryOptions({
      queryKey: keys.assets(projectId),
      queryFn: ({ signal }) =>
        guardedRead(client, keys.assets(projectId), () =>
          http.api.assets({ project_id: projectId || undefined }, { signal }),
        ),
      refetchInterval: 10000,
    }),
  folders: (client: QueryClient, projectId?: string | null) =>
    queryOptions({
      queryKey: keys.folders(projectId),
      queryFn: ({ signal }) =>
        guardedRead(client, keys.folders(projectId), () =>
          http.api.assetFolders(
            { project_id: projectId || undefined },
            { signal },
          ),
        ),
      refetchInterval: 10000,
    }),
  jobs: (client: QueryClient, projectId?: string | null) => {
    const key = projectId ? keys.projectJobs(projectId) : keys.jobs;
    return queryOptions({
      queryKey: key,
      queryFn: ({ signal }) =>
        guardedRead(client, key, () =>
          http.api.jobs({ project_id: projectId || undefined }, { signal }),
        ),
      refetchInterval: 3000,
    });
  },
  reviews: (client: QueryClient, projectId: string | null) =>
    queryOptions({
      queryKey: keys.reviews(projectId),
      queryFn: ({ signal }) =>
        guardedRead(client, keys.reviews(projectId), () =>
          http.api.comments(id(projectId!), { signal }),
        ),
      enabled: !!projectId,
    }),
  history: (projectId: string | null, revision?: number) =>
    queryOptions({
      queryKey: keys.history(projectId, revision),
      queryFn: ({ signal }) => http.api.history(id(projectId!), { signal }),
      enabled: !!projectId,
      staleTime: Infinity,
    }),
  voiceStatus: () =>
    queryOptions({
      queryKey: keys.voiceStatus,
      queryFn: ({ signal }) => http.api.voiceStatus({ signal }),
      staleTime: 30000,
    }),
  state: (client: QueryClient) =>
    queryOptions({
      queryKey: ["server-state"],
      queryFn: ({ signal }) => {
        const cached = client.getQueryData<StateSnapshot>(["server-state"]);
        return cached &&
          (isOptimistic(client, keys.jobs) ||
            isOptimistic(client, keys.projects))
          ? Promise.resolve(cached)
          : http.api.stateSnapshot({ signal });
      },
      refetchInterval: 1500,
      staleTime: 0,
    }),
  frame: (projectId: string, request: FrameRequest) =>
    queryOptions({
      queryKey: ["inspection", projectId, "frame", request],
      queryFn: ({ signal }) =>
        http.api.frame(id(projectId), request, { signal }),
      staleTime: Infinity,
    }),
  sheet: (projectId: string, request: SheetRequest) =>
    queryOptions({
      queryKey: ["inspection", projectId, "sheet", request],
      queryFn: ({ signal }) =>
        http.api.sheet(id(projectId), request, { signal }),
      staleTime: Infinity,
    }),
  audio: (projectId: string, request: AudioRequest) =>
    queryOptions({
      queryKey: ["inspection", projectId, "audio", request],
      queryFn: ({ signal }) =>
        http.api.audio(id(projectId), request, { signal }),
      staleTime: Infinity,
    }),
  textLayer: (request: TextLayerRequest) =>
    queryOptions({
      queryKey: ["text-layer", request],
      queryFn: ({ signal }) => http.api.previewTextLayer(request, { signal }),
      staleTime: Infinity,
      gcTime: 60000,
      structuralSharing: false,
    }),
  captionPreview: (request: TextLayerRequest) =>
    queryOptions({
      queryKey: ["caption-preview", request],
      queryFn: ({ signal }) => http.api.previewCaption(request, { signal }),
      staleTime: Infinity,
      gcTime: 60000,
    }),
  captions: (projectId: string, revision: number) =>
    queryOptions({
      queryKey: ["captions", projectId, revision],
      queryFn: ({ signal }) =>
        http.api.captions(
          id(projectId),
          { revision },
          { signal, format: "text" },
        ),
      staleTime: Infinity,
    }),
};
