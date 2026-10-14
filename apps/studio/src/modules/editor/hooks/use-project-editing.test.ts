// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import defaults from "@/api/generated/defaults.json";
import type { ProjectSnapshot } from "@/api/generated/client";
import { projectAfter } from "@/api/projectReducer";
import { keys } from "@/api/queries";
import { http } from "@/api/transport";
import { useStudio } from "@/modules/editor/store";
import { useProjectEditing } from "./use-project-editing";

afterEach(() => {
  vi.restoreAllMocks();
  useStudio.setState({ linking: true });
});

function setup() {
  const project = {
    ...structuredClone(defaults.project),
    id: "linked-split",
    revision: 10,
    tracks: ["video", "sound"].map((kind) => ({
      ...structuredClone(defaults.track),
      id: kind,
      kind,
      name: kind,
      clips: [
        {
          ...structuredClone(defaults.clip),
          id: `${kind}-clip`,
          name: kind,
          asset_id: "source",
          duration_ms: 8000,
        },
      ],
    })),
  } as ProjectSnapshot;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(keys.project(project.id), project);
  const notice = vi.fn();
  const hook = renderHook(
    () => useProjectEditing(project, [], notice, vi.fn(), vi.fn()),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return { ...hook, project, client, notice };
}

it("sends linked split as one revision-guarded batch and records one undo entry", async () => {
  const { result, project, client, unmount } = setup();
  const single = vi.spyOn(http.api, "operation");
  const batch = vi
    .spyOn(http.api, "batch")
    .mockImplementation(async (_id, request) => ({
      project: {
        ...projectAfter(project, { steps: request.operations }),
        revision: 11,
      },
      applied_operations: request.operations.length,
      base_revision: project.revision,
      committed: true,
    }));
  try {
    await act(async () => {
      const pending = result.current.edit("split_clip", {
        track_id: "video",
        clip_id: "video-clip",
        time_ms: 4000,
      });
      // The gesture retains its linking setting even if it waits in the write queue.
      useStudio.setState({ linking: false });
      await pending;
    });
    expect(batch).toHaveBeenCalledOnce();
    expect(single).not.toHaveBeenCalled();
    expect(batch.mock.calls[0][1]).toMatchObject({
      expected_revision: 10,
      operations: [
        {
          type: "split_clip",
          payload: { clip_id: "video-clip", time_ms: 4000 },
        },
        {
          type: "split_clip",
          payload: { clip_id: "sound-clip", time_ms: 4000 },
        },
      ],
    });
    expect(result.current.undoStacks.current[project.id]).toEqual({
      undo: [10],
      redo: [],
    });
    expect(
      client
        .getQueryData<ProjectSnapshot>(keys.project(project.id))
        ?.tracks.map((t) => t.clips.length),
    ).toEqual([2, 2]);
  } finally {
    unmount();
    client.clear();
  }
});

it("rolls both split projections back together when the server rejects either half", async () => {
  const { result, project, client, notice, unmount } = setup();
  let reject!: (error: Error) => void;
  const batch = vi.spyOn(http.api, "batch").mockImplementation(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      }),
  );
  try {
    let pending: ReturnType<typeof result.current.edit>;
    act(() => {
      pending = result.current.edit("split_clip", {
        track_id: "video",
        clip_id: "video-clip",
        time_ms: 4000,
      });
    });
    await waitFor(() => expect(batch).toHaveBeenCalledOnce());
    const projected = client.getQueryData<ProjectSnapshot>(
      keys.project(project.id),
    )!;
    expect(projected.tracks.map((t) => t.clips.length)).toEqual([2, 2]);
    expect(projected.revision).toBe(10);
    await act(async () => {
      reject(new Error("Revision conflict"));
      await pending;
    });
    expect(client.getQueryData(keys.project(project.id))).toEqual(project);
    expect(result.current.undoStacks.current[project.id]).toEqual({
      undo: [],
      redo: [],
    });
    expect(notice).toHaveBeenCalledWith("Revision conflict");
    expect(batch).toHaveBeenCalledOnce();
  } finally {
    unmount();
    client.clear();
  }
});
