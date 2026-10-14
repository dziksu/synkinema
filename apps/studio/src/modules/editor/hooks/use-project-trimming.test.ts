// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import defaults from "@/api/generated/defaults.json";
import type { Asset, ProjectSnapshot } from "@/api/generated/client";
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
    id: "linked-trim",
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
          duration_ms: 4000,
        },
      ],
    })),
  } as ProjectSnapshot;
  const assets = [
    { id: "source", kind: "video", duration_ms: 8000 },
  ] as Asset[];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(keys.project(project.id), project);
  const notice = vi.fn();
  const hook = renderHook(
    () => useProjectEditing(project, assets, notice, vi.fn(), vi.fn()),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return { ...hook, project, client, notice };
}

it("commits a linked trim atomically with one undo entry and the captured linking preference", async () => {
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
      base_revision: 10,
      committed: true,
    }));
  try {
    await act(async () => {
      const pending = result.current.edit("trim_clips", {
        clip_id: "video-clip",
        side: "right",
        time_ms: 3000,
      });
      useStudio.setState({ linking: false });
      await pending;
    });
    expect(single).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledOnce();
    expect(batch.mock.calls[0][1]).toMatchObject({
      expected_revision: 10,
      operations: [
        {
          type: "trim_clip",
          payload: { clip_id: "video-clip", changes: { duration_ms: 3000 } },
        },
        {
          type: "trim_clip",
          payload: { clip_id: "sound-clip", changes: { duration_ms: 3000 } },
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
        ?.tracks.map((t) => t.clips[0].duration_ms),
    ).toEqual([3000, 3000]);
  } finally {
    unmount();
    client.clear();
  }
});

it("preserves single-half trimming when linking was disabled for the gesture", async () => {
  const { result, project, client, unmount } = setup();
  const batch = vi.spyOn(http.api, "batch");
  const single = vi
    .spyOn(http.api, "operation")
    .mockImplementation(async (_id, request) => ({
      ...projectAfter(project, { steps: [request] }),
      revision: 11,
    }));
  try {
    await act(async () => {
      await result.current.edit("trim_clips", {
        clip_id: "video-clip",
        side: "left",
        time_ms: 1000,
        linking: false,
      });
    });
    expect(single).toHaveBeenCalledOnce();
    expect(batch).not.toHaveBeenCalled();
    expect(
      client
        .getQueryData<ProjectSnapshot>(keys.project(project.id))
        ?.tracks.map((t) => [t.clips[0].duration_ms, t.clips[0].source_in_ms]),
    ).toEqual([
      [3000, 1000],
      [4000, 0],
    ]);
  } finally {
    unmount();
    client.clear();
  }
});

it("rolls back both linked trim projections together on a revision conflict", async () => {
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
      pending = result.current.edit("trim_clips", {
        clip_id: "sound-clip",
        side: "left",
        time_ms: 1000,
      });
    });
    await waitFor(() => expect(batch).toHaveBeenCalledOnce());
    const projected = client.getQueryData<ProjectSnapshot>(
      keys.project(project.id),
    )!;
    expect(
      projected.tracks.map((t) => [
        t.clips[0].start_ms,
        t.clips[0].duration_ms,
        t.clips[0].source_in_ms,
      ]),
    ).toEqual([
      [1000, 3000, 1000],
      [1000, 3000, 1000],
    ]);
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
