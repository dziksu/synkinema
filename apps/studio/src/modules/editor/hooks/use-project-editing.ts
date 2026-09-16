import { tr } from "@/lib/i18n";
import {
  canvasInsert,
  layerInsert,
  type CanvasInsert,
} from "@/modules/editor/layerInsert";
import { placementOf } from "@/modules/editor/preview/CanvasTools";
import {
  sourceInsert,
  type SourceInsert,
} from "@/modules/editor/source/sourceInsert";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";

import type { EditStep } from "@/api/generated/client";
import { writes } from "@/api/mutations";
import { projectWrites } from "@/api/projectMutations";
import type { Asset, Clip, Project } from "@/lib/types";
import { inspectorEdit } from "@/modules/editor/inspector/inspectorEdit";
import { useStudio } from "@/modules/editor/store";
import { deleteTimelineTrack } from "@/modules/editor/timeline/timelineActions";
import { freeStart } from "@/modules/editor/timeline/timelineMath";

export function useProjectEditing(
  project: Project | undefined,
  assets: Asset[],
  setNotice: (v: string) => void,
  setInspectorReset: React.Dispatch<React.SetStateAction<number>>,
  setShowRender: (v: boolean) => void,
) {
  const query = useQueryClient();
  const state = useStudio.getState();
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
        return p;
      })
      .catch((e: Error) => {
        setInspectorReset((n) => n + 1);
        setNotice(e.message);
      });
  };

  return { undoStacks, operation, resolveComment, addComment, edit };
}
