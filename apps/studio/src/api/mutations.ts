import {
  optimistic,
  updateConfirmed,
  type OptimisticContext,
} from "@/api/cache";
import type {
  Asset,
  AssetBatchUpdate,
  AssetFolder,
  AssetLocation,
  AssetMetadataUpdate,
  AssetUsage,
  Channel,
  ChannelDetail,
  ChannelInput,
  ChannelReviewWrite,
  ChannelUpdate,
  CommentRequest,
  DeleteAssetsRequest,
  DeleteJobsRequest,
  DeletionResult,
  Project,
  ProjectSnapshot,
  PublicationWrite,
  RemoveAssetLocation,
  RenderJob,
  RenderRequestInput,
  ReviewComment,
  StateSnapshot,
  VoiceRequest,
} from "@/api/generated/client";
import defaults from "@/api/generated/defaults.json";
import { keys } from "@/api/queries";
import { http } from "@/api/transport";
import { createId } from "@/lib/createId";
import { tr } from "@/lib/i18n";
import {
  mutationOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

export { chatWrites } from "@/api/chatMutations";

type Change<T> = (old: T[] | undefined) => T[];
const replace = <T extends { id: string }>(items: T[] | undefined, value: T) =>
  (items || []).map((item) => (item.id === value.id ? value : item));
const assetKeys = (client: QueryClient) =>
  client.getQueriesData<Asset[]>({ queryKey: ["assets"] }).map(([key]) => key);
const refresh = (client: QueryClient, prefixes: QueryKey[]) =>
  Promise.all(
    prefixes.map((queryKey) => client.invalidateQueries({ queryKey })),
  );
const jobKeys = (client: QueryClient) => {
  const known = client
    .getQueriesData({ queryKey: keys.jobs })
    .map(([key]) => key);
  return known.length ? known : [keys.jobs];
};
const jobPatches = (client: QueryClient, apply: Change<RenderJob>) =>
  jobKeys(client).map((key) => ({ key, apply }));
const pendingId = () => `pending:${createId()}`;
const metadataScope = { id: "media-metadata" };

const belongsToProject = (key: QueryKey, id: string) =>
  [
    "project",
    "history",
    "reviews",
    "assets",
    "asset-folders",
    "inspection",
    "export-plan",
    "captions",
    "jobs",
  ].includes(String(key[0])) && key[1] === id;
export async function reconcileDeletion(
  client: QueryClient,
  result: DeletionResult,
) {
  const related = (key: QueryKey) =>
    result.project_ids.some((id) => belongsToProject(key, id)) ||
    (key[0] === "inspection" && result.job_ids.length > 0);
  await client.cancelQueries({
    predicate: (q) => related(q.queryKey) || q.queryKey[0] === "server-state",
  });
  client.removeQueries({ predicate: (q) => related(q.queryKey) });
  // Prevent an old synchronization snapshot from reintroducing deleted rows.
  const state = client.getQueryData<StateSnapshot>(["server-state"]);
  if (state)
    client.setQueryData<StateSnapshot>(["server-state"], {
      ...state,
      projects: state.projects.filter(
        (p) => !result.project_ids.includes(p.id),
      ),
      jobs: state.jobs.filter(
        (j) =>
          !result.job_ids.includes(j.id) &&
          !result.project_ids.includes(j.project_id),
      ),
    });
  updateConfirmed(client, keys.jobs, (old: RenderJob[] = []) =>
    old.filter(
      (j) =>
        !result.job_ids.includes(j.id) &&
        !result.project_ids.includes(j.project_id),
    ),
  );
  updateConfirmed(client, keys.projects, (old: ProjectSnapshot[] = []) =>
    old.filter((p) => !result.project_ids.includes(p.id)),
  );
  for (const key of assetKeys(client))
    updateConfirmed(client, key, (old: Asset[] = []) =>
      old.filter((a) => !result.asset_ids.includes(a.id)),
    );
  for (const id of result.asset_ids)
    client.removeQueries({ queryKey: keys.assetUsage(id) });
  await refresh(client, [
    keys.jobs,
    keys.projects,
    keys.cleanup,
    ["channel"],
    ["assets"],
    ["server-state"],
  ]);
}
const matchesDeletion = (j: RenderJob, request: DeleteJobsRequest) =>
  (!request.project_id || j.project_id === request.project_id) &&
  (request.job_ids
    ? request.job_ids.includes(j.id)
    : request.status === "all" ||
      ["completed", "failed", "cancelled"].includes(j.status));

export const writes = {
  uploadChannelLogo: () =>
    mutationOptions({
      mutationKey: ["upload-channel-logo"],
      retry: false,
      mutationFn: (file: File) => http.api.uploadChannelLogo({ file }),
    }),
  createChannel: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["create-channel"],
      retry: false,
      mutationFn: (request: ChannelInput) => http.api.createChannel(request),
      onSuccess: (data) =>
        updateConfirmed<Channel[]>(client, keys.channels, (old = []) => [
          data,
          ...old,
        ]),
      onSettled: () => refresh(client, [keys.channels]),
    }),
  updateChannel: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["channel-write"],
      scope: { id: "channel-write" },
      retry: false,
      mutationFn: ({
        channelId,
        request,
      }: {
        channelId: string;
        request: ChannelUpdate;
      }) => http.api.updateChannel(channelId, request),
      onMutate: ({ channelId, request }) => {
        const { expected_version: _version, ...fields } = request;
        return optimistic(client, [
          {
            key: keys.channels,
            apply: (old: Channel[] = []) =>
              old.map((c) => (c.id === channelId ? { ...c, ...fields } : c)),
          },
          {
            key: keys.channel(channelId),
            apply: (old: ChannelDetail | undefined) =>
              old ? { ...old, channel: { ...old.channel, ...fields } } : old,
          },
        ]);
      },
      onSettled: async (data, _error, { channelId }, context) => {
        context?.settle(!!data, (key, old) =>
          key[0] === "channels"
            ? replace(old, data!)
            : old
              ? { ...old, channel: data }
              : old,
        );
        await refresh(client, [
          keys.channels,
          keys.channel(channelId),
          keys.projects,
          ["project"],
        ]);
      },
    }),
  channelPublication: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["channel-write"],
      scope: { id: "channel-write" },
      retry: false,
      mutationFn: ({
        channelId,
        request,
      }: {
        channelId: string;
        request: PublicationWrite;
      }) => http.api.recordChannelPublication(channelId, request),
      onMutate: ({ channelId, request }) => {
        const {
          expected_version: _version,
          publication_id: publicationId,
          ...fields
        } = request;
        return optimistic(client, [
          {
            key: keys.channel(channelId),
            apply: (old: ChannelDetail | undefined) =>
              old && publicationId
                ? {
                    ...old,
                    publications: old.publications.map((p) =>
                      p.id === publicationId ? { ...p, ...fields } : p,
                    ),
                  }
                : old,
          },
        ]);
      },
      onSettled: async (data, _error, { channelId }, context) => {
        context?.settle(!!data, () => data);
        if (data) updateConfirmed(client, keys.channel(channelId), () => data);
        await refresh(client, [
          keys.channels,
          keys.channel(channelId),
          keys.projects,
          ["project"],
        ]);
      },
    }),
  channelReview: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["channel-write"],
      scope: { id: "channel-write" },
      retry: false,
      mutationFn: ({
        channelId,
        request,
      }: {
        channelId: string;
        request: ChannelReviewWrite;
      }) => http.api.recordChannelReview(channelId, request),
      onSuccess: (data) =>
        updateConfirmed(client, keys.channel(data.channel.id), () => data),
      onSettled: (_data, _error, { channelId }) =>
        refresh(client, [
          keys.channels,
          keys.channel(channelId),
          keys.projects,
          ["project"],
        ]),
    }),
  assetMetadata: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["asset-metadata"],
      scope: metadataScope,
      retry: false,
      mutationFn: ({
        assetId,
        request,
      }: {
        assetId: string;
        request: AssetMetadataUpdate;
      }) => http.api.updateAsset(assetId, request),
      onMutate: ({ assetId, request }) =>
        optimistic(
          client,
          assetKeys(client).map((key) => ({
            key,
            apply: (old: Asset[] = []) =>
              old.map((a) =>
                a.id === assetId
                  ? {
                      ...a,
                      name: request.name.trim(),
                      tags: [...new Set(request.tags)],
                      source: request.source,
                      license: request.license,
                    }
                  : a,
              ),
          })),
        ),
      onSettled: async (data, _error, request, context) => {
        context?.settle(!!data, (_key, old: Asset[]) => replace(old, data!));
        await refresh(client, [["assets"], keys.assetUsage(request.assetId)]);
      },
    }),
  mediaBatch: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["media-batch"],
      scope: metadataScope,
      retry: false,
      mutationFn: (request: AssetBatchUpdate) => http.api.batchAssets(request),
      onMutate: (request: AssetBatchUpdate) => {
        const scope = request.destination?.project_id || "library";
        const all = client
          .getQueriesData<Asset[]>({ queryKey: ["assets"] })
          .flatMap(([, items]) => items || []);
        const selected = [
          ...new Map(
            all
              .filter((a) => request.asset_ids.includes(a.id))
              .map((a) => [a.id, a]),
          ).values(),
        ];
        const target = keys.assets(request.destination?.project_id);
        const affected =
          request.action === "locate"
            ? [
                ...assetKeys(client).filter(
                  (key) => JSON.stringify(key) !== JSON.stringify(target),
                ),
                target,
              ]
            : assetKeys(client);
        return optimistic(
          client,
          affected.map((key) => ({
            key,
            apply: (old: Asset[] = []) => {
              const items =
                request.action === "locate" && key[1] === scope
                  ? [
                      ...old,
                      ...selected.filter(
                        (a) => !old.some((v) => v.id === a.id),
                      ),
                    ]
                  : old;
              return items.map((a) =>
                !request.asset_ids.includes(a.id)
                  ? a
                  : request.action === "locate"
                    ? {
                        ...a,
                        locations: {
                          ...a.locations,
                          [scope]: request.destination?.folder_id || "",
                        },
                      }
                    : {
                        ...a,
                        tags:
                          request.action === "add_tags"
                            ? [
                                ...new Set([
                                  ...a.tags,
                                  ...(request.tags || []),
                                ]),
                              ].sort()
                            : a.tags.filter((t) => !request.tags?.includes(t)),
                      },
              );
            },
          })),
        );
      },
      onSettled: async (data, _error, request, context) => {
        context?.settle(!!data, (key, old: Asset[] = []) => {
          const values = new Map(data!.map((a) => [a.id, a]));
          const result = old.map((a) => values.get(a.id) || a);
          return request.action === "locate" &&
            key[1] === (request.destination?.project_id || "library")
            ? [
                ...result,
                ...data!.filter((a) => !result.some((v) => v.id === a.id)),
              ]
            : result;
        });
        await refresh(client, [["assets"], ["asset-usage"]]);
      },
    }),
  removeMediaMembership: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["remove-media-membership"],
      scope: metadataScope,
      retry: false,
      mutationFn: ({
        assetId,
        request,
      }: {
        assetId: string;
        request: RemoveAssetLocation;
      }) => http.api.removeAssetLocation(assetId, request),
      onMutate: ({ assetId, request }) => {
        const scope = request.project_id || "library";
        const usage = client.getQueryData<AssetUsage>(keys.assetUsage(assetId));
        return optimistic(
          client,
          assetKeys(client).map((key) => ({
            key,
            apply: (old: Asset[] = []) =>
              old
                .filter((a) => !(key[1] === scope && a.id === assetId))
                .map((a) => {
                  if (a.id !== assetId) return a;
                  const locations = { ...a.locations };
                  delete locations[scope];
                  if (scope === "library")
                    for (const p of usage?.projects || [])
                      locations[p.project_id] ??= "";
                  return { ...a, locations };
                }),
          })),
        );
      },
      onSettled: async (data, _error, request, context) => {
        context?.settle(!!data, (key, old: Asset[] = []) =>
          old
            .filter(
              (a) =>
                !(
                  a.id === request.assetId &&
                  key[1] === (request.request.project_id || "library")
                ),
            )
            .map((a) => (a.id === data!.id ? data! : a)),
        );
        await refresh(client, [["assets"], keys.assetUsage(request.assetId)]);
      },
    }),
  deleteMedia: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["delete-media"],
      scope: metadataScope,
      retry: false,
      mutationFn: (request: DeleteAssetsRequest) =>
        http.api.deleteAssets(request),
      onMutate: (request: DeleteAssetsRequest) =>
        optimistic(
          client,
          assetKeys(client).map((key) => ({
            key,
            apply: (old: Asset[] = []) =>
              old.filter(
                (a) => !request.assets.some((item) => item.id === a.id),
              ),
          })),
        ),
      onSettled: async (data, _error, _request, context) => {
        context?.settle(!!data, (_key, old: Asset[] = []) =>
          old.filter((a) => !data!.asset_ids.includes(a.id)),
        );
        if (data) await reconcileDeletion(client, data);
        else await refresh(client, [["assets"], ["asset-usage"]]);
      },
    }),
  deleteFolder: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["delete-folder"],
      scope: metadataScope,
      retry: false,
      mutationFn: ({ folderId }: { folderId: string; projectId?: string }) =>
        http.api.deleteAssetFolder(folderId),
      onMutate: ({ folderId, projectId }) =>
        optimistic(client, [
          {
            key: keys.folders(projectId),
            apply: (old: AssetFolder[] = []) =>
              old.filter((f) => f.id !== folderId),
          },
          ...assetKeys(client).map((key) => ({
            key,
            apply: (old: Asset[] = []) =>
              old.map((a) =>
                a.locations[projectId || "library"] === folderId
                  ? {
                      ...a,
                      locations: {
                        ...a.locations,
                        [projectId || "library"]: "",
                      },
                    }
                  : a,
              ),
          })),
        ]),
      onSettled: async (data, _error, request, context) => {
        context?.settle(!!data, (key, old: Asset[] | AssetFolder[] = []) =>
          key[0] === "asset-folders"
            ? old.filter((f) => f.id !== request.folderId)
            : (old as Asset[]).map(
                (a) => data!.assets.find((v) => v.id === a.id) || a,
              ),
        );
        await refresh(client, [["assets"], ["asset-folders"], ["asset-usage"]]);
      },
    }),
  deleteJobs: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["delete-jobs"],
      scope: { id: "deletion" },
      retry: false,
      mutationFn: (request: DeleteJobsRequest) => http.api.clearJobs(request),
      onMutate: (request: DeleteJobsRequest) =>
        optimistic(
          client,
          jobPatches(client, (old = []) =>
            old.filter((j) => !matchesDeletion(j, request)),
          ),
        ),
      onSettled: async (result, _error, _request, context) => {
        context?.settle(!!result, (_key, old: RenderJob[] = []) =>
          old.filter((j) => !result!.job_ids.includes(j.id)),
        );
        if (result) await reconcileDeletion(client, result);
        else await refresh(client, [keys.jobs]);
      },
    }),
  deleteProject: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["delete-project"],
      scope: { id: "deletion" },
      retry: false,
      mutationFn: (project: ProjectSnapshot) =>
        http.api.deleteProject(project.id, {
          expected_revision: project.revision,
        }),
      onMutate: async (project: ProjectSnapshot) => {
        if (client.isMutating({ mutationKey: ["project-edit"] }))
          throw new Error(tr("Wait for project changes to finish saving."));
        return optimistic(client, [
          {
            key: keys.projects,
            apply: (old: ProjectSnapshot[] = []) =>
              old.filter((p) => p.id !== project.id),
          },
          ...jobPatches(client, (old = []) =>
            old.filter((j) => j.project_id !== project.id),
          ),
        ]);
      },
      onSettled: async (result, _error, project, context) => {
        context?.settle(
          !!result,
          (key, old: ProjectSnapshot[] | RenderJob[] = []) =>
            key[0] === "projects"
              ? old.filter((p) => p.id !== project.id)
              : (old as RenderJob[]).filter((j) => j.project_id !== project.id),
        );
        if (result) await reconcileDeletion(client, result);
        else
          await refresh(client, [
            keys.projects,
            keys.project(project.id),
            keys.jobs,
          ]);
      },
    }),
  retryCleanup: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["retry-cleanup"],
      retry: false,
      mutationFn: () => http.api.retryCleanup(),
      onSettled: () => refresh(client, [keys.cleanup]),
    }),
  createProject: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["create-project"],
      retry: false,
      mutationFn: (request: Project) => http.api.create(request),
      onMutate: async (request: Project) => {
        const draft = {
          ...defaults.project,
          ...request,
          profile: { ...defaults.profile, ...request.profile },
          id: pendingId(),
        } as ProjectSnapshot;
        const transaction = await optimistic(client, [
          {
            key: keys.projects,
            apply: (old: ProjectSnapshot[] = []) => [draft, ...old],
          },
        ]);
        return { transaction, draft };
      },
      onSettled: async (data, _error, _request, context) => {
        context?.transaction.settle(
          !!data,
          (_key, old: ProjectSnapshot[] = []) => [data!, ...old],
        );
        if (data) client.setQueryData(keys.project(data.id), data);
        await refresh(client, [keys.projects, ["channel"]]);
      },
    }),
  upload: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["upload"],
      retry: false,
      mutationFn: async ({
        files,
        destination,
      }: {
        files: File[];
        destination: AssetLocation;
      }) => {
        const imported: Asset[] = [];
        for (const file of files) {
          const asset = await http.api.upload({ file, ...destination });
          imported.push(asset);
          // Only expose playable media after probing succeeds; pending file names live in mutation variables.
          const key = keys.assets(destination.project_id);
          updateConfirmed<Asset[]>(client, key, (old) => [
            asset,
            ...(old || []).filter((a) => a.id !== asset.id),
          ]);
        }
        return imported;
      },
      onSettled: () => refresh(client, [["assets"]]),
    }),
  folder: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["folder"],
      scope: metadataScope,
      retry: false,
      mutationFn: ({
        folderId,
        name,
        projectId,
      }: {
        folderId?: string;
        name: string;
        projectId?: string;
      }) =>
        folderId
          ? http.api.renameAssetFolder(folderId, { name })
          : http.api.createAssetFolder({ name, project_id: projectId }),
      onMutate: async ({ folderId, name, projectId }) => {
        const draft = { id: folderId || pendingId(), name };
        const transaction = await optimistic(client, [
          {
            key: keys.folders(projectId),
            apply: ((old = []) =>
              folderId
                ? replace(old, draft)
                : [...old, draft]) as Change<AssetFolder>,
          },
        ]);
        return { transaction, draft };
      },
      onSettled: async (data, _error, request, context) => {
        context?.transaction.settle(!!data, (_key, old: AssetFolder[] = []) =>
          request.folderId ? replace(old, data!) : [...old, data!],
        );
        await refresh(client, [["asset-folders"]]);
      },
    }),
  location: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["asset-location"],
      scope: metadataScope,
      retry: false,
      mutationFn: ({
        assetId,
        destination,
      }: {
        assetId: string;
        destination: AssetLocation;
      }) => http.api.locateAsset(assetId, destination),
      onMutate: async ({ assetId, destination }) => {
        const targetKey = keys.assets(destination.project_id);
        const source = client
          .getQueriesData<Asset[]>({ queryKey: ["assets"] })
          .flatMap(([, data]) => data || [])
          .find((a) => a.id === assetId);
        const scope = destination.project_id || "library";
        const allKeys = [
          ...assetKeys(client).filter(
            (k) => JSON.stringify(k) !== JSON.stringify(targetKey),
          ),
          targetKey,
        ];
        return optimistic(
          client,
          allKeys.map((key) => ({
            key,
            apply: (old: Asset[] = []) => {
              const items =
                key[1] === scope && !old.some((a) => a.id === assetId) && source
                  ? [...old, source]
                  : old;
              return items.map((a) =>
                a.id === assetId
                  ? {
                      ...a,
                      locations: {
                        ...a.locations,
                        [scope]: destination.folder_id || "",
                      },
                    }
                  : a,
              );
            },
          })),
        );
      },
      onSettled: async (data, _error, request, context) => {
        context?.settle(!!data, (key, old: Asset[] = []) =>
          key[1] === (request.destination.project_id || "library") &&
          !old.some((a) => a.id === request.assetId)
            ? [...old, data!]
            : replace(old, data!),
        );
        await refresh(client, [["assets"], ["asset-usage"]]);
      },
    }),
  tags: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["asset-tags"],
      scope: metadataScope,
      retry: false,
      mutationFn: ({ assetId, tags }: { assetId: string; tags: string[] }) =>
        http.api.tags(assetId, tags),
      onMutate: ({ assetId, tags }) =>
        optimistic(
          client,
          assetKeys(client).map((key) => ({
            key,
            apply: (old: Asset[] = []) =>
              old.map((a) => (a.id === assetId ? { ...a, tags } : a)),
          })),
        ),
      onSettled: async (data, _error, _request, context) => {
        context?.settle(!!data, (_key, old: Asset[]) => replace(old, data!));
        await refresh(client, [["assets"], ["asset-usage"]]);
      },
    }),
  comment: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["review-comment"],
      retry: false,
      mutationFn: ({
        projectId,
        request,
      }: {
        projectId: string;
        request: CommentRequest;
      }) => http.api.comment(projectId, request),
      onMutate: ({ projectId, request }) => {
        const id = pendingId();
        return optimistic(client, [
          {
            key: keys.reviews(projectId),
            apply: (old: ReviewComment[] = []) => [
              ...old,
              {
                ...request,
                id,
                project_id: projectId,
                created_at: new Date().toISOString(),
                resolved: false,
              },
            ],
          },
        ]);
      },
      onSettled: async (data, _error, request, context) => {
        context?.settle(!!data, (_key, old: ReviewComment[] = []) => [
          ...old,
          data!,
        ]);
        await refresh(client, [keys.reviews(request.projectId)]);
      },
    }),
  resolveComment: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["resolve-comment"],
      retry: false,
      mutationFn: ({
        projectId,
        commentId,
      }: {
        projectId: string;
        commentId: string;
      }) => http.api.resolveComment(projectId, commentId),
      onMutate: ({ projectId, commentId }) =>
        optimistic(client, [
          {
            key: keys.reviews(projectId),
            apply: (old: ReviewComment[] = []) =>
              old.map((c) =>
                c.id === commentId ? { ...c, resolved: true } : c,
              ),
          },
        ]),
      onSettled: async (data, _error, request, context) => {
        context?.settle(!!data, (_key, old: ReviewComment[]) =>
          replace(old, data!),
        );
        await refresh(client, [keys.reviews(request.projectId)]);
      },
    }),
  render: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["render"],
      retry: false,
      mutationFn: ({
        project,
        request,
      }: {
        project: ProjectSnapshot;
        request: RenderRequestInput;
      }) => http.api.render(project.id, request),
      onMutate: ({ project, request }) => {
        const id = pendingId();
        return optimistic(
          client,
          jobKeys(client)
            .filter((key) => key.length === 1 || key[1] === project.id)
            .map((key) => ({
              key,
              apply: (old: RenderJob[] = []) => [
                {
                  id,
                  project_id: project.id,
                  project_name: project.name,
                  revision: project.revision,
                  status: "queued",
                  phase: "Submitting",
                  progress: 0,
                  created_at: new Date().toISOString(),
                  request,
                  error: null,
                  output_url: null,
                },
                ...old,
              ],
            })),
        );
      },
      onSettled: async (data, _error, _request, context) => {
        context?.settle(!!data, (_key, old: RenderJob[] = []) => [
          data!,
          ...old,
        ]);
        await refresh(client, [keys.jobs]);
      },
    }),
  cancelJob: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["cancel-job"],
      retry: false,
      mutationFn: (jobId: string) => http.api.cancel(jobId),
      onMutate: (jobId: string) =>
        optimistic(
          client,
          jobPatches(client, (old = []) =>
            old.map((j) =>
              j.id === jobId && ["queued", "running"].includes(j.status)
                ? { ...j, status: "cancelled", phase: "Cancelling" }
                : j,
            ),
          ),
        ),
      onSettled: async (
        data,
        _error,
        _request,
        context: OptimisticContext | undefined,
      ) => {
        context?.settle(!!data, (_key, old: RenderJob[]) =>
          replace(old, data!),
        );
        await refresh(client, [keys.jobs]);
      },
    }),
  voice: (client: QueryClient) =>
    mutationOptions({
      mutationKey: ["generate-voice"],
      retry: false,
      mutationFn: (request: VoiceRequest) => http.api.generateVoice(request),
      onSuccess: ({ asset }, request) => {
        updateConfirmed<Asset[]>(
          client,
          keys.assets(request.project_id),
          (old) => [asset, ...(old || []).filter((a) => a.id !== asset.id)],
        );
      },
      onSettled: () => refresh(client, [["assets"], keys.voiceStatus]),
    }),
};
