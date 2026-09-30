import { optimistic, type OptimisticContext } from "@/api/cache";
import type {
  Operation,
  ProjectSnapshot as Project,
  RemoveScriptAudioRequest,
  RemoveScriptAudioResult,
  ReplaceScriptAudioRequest,
} from "@/api/generated/client";
import { reconcileDeletion } from "@/api/mutations";
import {
  identifySteps,
  projectAfter,
  replacedAudioIds,
  type EditPlan,
} from "@/api/projectReducer";
import { keys, reads } from "@/api/queries";
import { http } from "@/api/transport";
import { tr } from "@/lib/i18n";
import { EditQueue } from "@/modules/editor/editQueue";
import { mutationOptions, type QueryClient } from "@tanstack/react-query";

type Session = {
  prepare: Promise<unknown>;
  queue: EditQueue;
  confirmed?: Project;
  pending: number;
  generation: number;
};
const sessions = new WeakMap<QueryClient, Map<string, Session>>();
function session(client: QueryClient, id: string) {
  let all = sessions.get(client);
  if (!all) {
    all = new Map();
    sessions.set(client, all);
  }
  let value = all.get(id);
  if (!value) {
    value = {
      prepare: Promise.resolve(),
      queue: new EditQueue(),
      pending: 0,
      generation: 0,
    };
    all.set(id, value);
  }
  return value;
}
export type ProjectEdit = {
  projectId: string;
  resolve: (current: Project) => EditPlan | Promise<EditPlan>;
  plan?: EditPlan;
  generation?: number;
  removeAudio?: {
    lineId: string;
    request: Omit<RemoveScriptAudioRequest, "expected_revision">;
  };
  replaceAudio?: {
    lineId: string;
    request: Omit<ReplaceScriptAudioRequest, "expected_revision">;
  };
  removalResult?: RemoveScriptAudioResult;
  replacementResult?: RemoveScriptAudioResult;
};
type Context = {
  transaction: OptimisticContext;
  before: Project;
  plan: EditPlan;
};
export const projectWrites = (client: QueryClient) =>
  mutationOptions<Project, Error, ProjectEdit, Context>({
    mutationKey: ["project-edit"],
    retry: false,
    onMutate: (edit) => {
      const state = session(client, edit.projectId);
      // Planning is ordered too, so two same-tick gestures see each other's projection.
      const generation = state.generation;
      const prepare = state.prepare.then(async () => {
        if (generation !== state.generation)
          throw new Error(
            tr("Pending edits were cancelled after a save error. Try again."),
          );
        await client.cancelQueries({
          queryKey: keys.project(edit.projectId),
          exact: true,
        });
        const current = client.getQueryData<Project>(
          keys.project(edit.projectId),
        );
        if (!current)
          throw new Error(tr("This project is closed. Open it again."));
        if (!state.pending) {
          state.confirmed = current;
          state.queue = new EditQueue();
        }
        client.setQueryData(
          [...keys.project(current.id), current.revision],
          state.confirmed,
        );
        const resolved = await edit.resolve(current);
        const plan: EditPlan = {
          ...resolved,
          steps: identifySteps(resolved.steps),
        };
        const audioIds = replacedAudioIds(current, plan.steps);
        if (audioIds.length) {
          const assets = await client.fetchQuery(
            reads.assets(client, current.id),
          );
          plan.audioAssets = Object.fromEntries(
            assets
              .filter((asset) => audioIds.includes(asset.id))
              .map((asset) => [asset.id, asset]),
          );
        }
        const restore = plan.steps.find((s) => s.type === "restore_revision");
        if (restore?.type === "restore_revision")
          plan.restored = await client.fetchQuery(
            reads.project(client, current.id, restore.payload.revision),
          );
        // Fail before adding a cache layer if a dependent object is no longer present.
        projectAfter(current, plan);
        edit.plan = plan;
        edit.generation = state.generation;
        const transaction = await optimistic(
          client,
          [
            {
              key: keys.project(current.id),
              apply: (old: Project) => projectAfter(old, plan),
            },
            {
              key: keys.projects,
              apply: (old: Project[] = []) =>
                old.map((p) =>
                  p.id === current.id
                    ? {
                        ...projectAfter(current, plan),
                        revision: Math.max(p.revision, current.revision),
                      }
                    : p,
                ),
            },
          ],
          `project:${current.id}`,
        );
        state.pending++;
        return { transaction, before: current, plan };
      });
      state.prepare = prepare.catch(() => undefined);
      return prepare;
    },
    mutationFn: (edit) => {
      const state = session(client, edit.projectId);
      return state.queue.enqueue(async () => {
        if (edit.generation !== state.generation)
          throw new Error(
            tr("Pending edits were cancelled after a save error. Try again."),
          );
        const revision = state.confirmed!.revision;
        const plan = edit.plan!;
        try {
          const removal = edit.removeAudio
            ? await http.api.removeScriptAudio(
                edit.projectId,
                edit.removeAudio.lineId,
                { ...edit.removeAudio.request, expected_revision: revision },
              )
            : undefined;
          const replacement = edit.replaceAudio
            ? await http.api.replaceScriptAudio(
                edit.projectId,
                edit.replaceAudio.lineId,
                { ...edit.replaceAudio.request, expected_revision: revision },
              )
            : undefined;
          edit.removalResult = removal;
          edit.replacementResult = replacement;
          const project =
            (removal ?? replacement)?.project ??
            (plan.batch || plan.steps.length !== 1
              ? (
                  await http.api.batch(edit.projectId, {
                    expected_revision: revision,
                    operations: plan.steps,
                  })
                ).project
              : await http.api.operation(edit.projectId, {
                  ...plan.steps[0],
                  expected_revision: revision,
                } as Operation));
          state.confirmed = project;
          return project;
        } catch (error) {
          state.generation++;
          throw error;
        }
      });
    },
    onSettled: async (project, _error, edit, context) => {
      const state = session(client, edit.projectId);
      const audioCleanup = edit.removalResult ?? edit.replacementResult;
      if (project && audioCleanup) {
        // Removed takes are intentionally absent from historical script reads.
        // Discard pinned snapshots before undo can restore a cached association.
        const historical = {
          predicate: (q: { queryKey: readonly unknown[] }) =>
            q.queryKey[0] === "project" &&
            q.queryKey[1] === edit.projectId &&
            q.queryKey.length > 2,
        };
        await client.cancelQueries(historical);
        client.removeQueries(historical);
        await client.cancelQueries({ queryKey: ["assets"] });
        await reconcileDeletion(client, audioCleanup);
        await client.invalidateQueries({ queryKey: ["jobs"] });
      }
      if (context) {
        if (!project) context.transaction.rollbackGroup();
        context.transaction.settle(
          !!project,
          (key, old: Project | Project[]) =>
            key[0] === "project"
              ? project
              : ((old as Project[]) || []).map((p) =>
                  p.id === edit.projectId ? project! : p,
                ),
        );
        state.pending--;
      }
      if (project)
        client.setQueryData(
          [...keys.project(project.id), project.revision],
          project,
        );
      if (!state.pending) {
        await Promise.all([
          client.invalidateQueries({
            queryKey: keys.project(edit.projectId),
            exact: true,
          }),
          client.invalidateQueries({ queryKey: keys.projects }),
          client.invalidateQueries({ queryKey: ["channel"] }),
          client.invalidateQueries({ queryKey: ["history", edit.projectId] }),
          client.invalidateQueries({ queryKey: keys.assets(edit.projectId) }),
          client.invalidateQueries({ queryKey: ["asset-usage"] }),
        ]);
      }
    },
  });
