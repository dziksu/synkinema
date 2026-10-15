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
  useStudio.setState({
    linking: true,
    selectedIds: [],
    selectedId: null,
    projectId: null,
  });
});

function setup(pairedCuts = false) {
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
  if (pairedCuts)
    for (const track of project.tracks) {
      track.clips[0].duration_ms = 4000;
      track.clips.push({
        ...structuredClone(track.clips[0]),
        id: `${track.id}-second`,
        start_ms: 4000,
        source_in_ms: 4000,
      });
    }
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

it("saves a transition and its audio companion lane atomically, undoes it, and allows another transition", async () => {
  const { result, project, client, notice, unmount } = setup(true);
  let server = structuredClone(project);
  const batch = vi
    .spyOn(http.api, "batch")
    .mockImplementation(async (_id, request) => {
      const base = server.revision;
      expect(request.expected_revision).toBe(base);
      server = {
        ...projectAfter(server, { steps: request.operations }),
        revision: base + 1,
      };
      return {
        project: server,
        applied_operations: request.operations.length,
        base_revision: base,
        committed: true,
      };
    });
  const operation = vi
    .spyOn(http.api, "operation")
    .mockImplementation(async (_id, request) => {
      expect(request).toMatchObject({
        type: "restore_revision",
        payload: { revision: 10 },
        expected_revision: 11,
      });
      server = { ...structuredClone(project), revision: 12 };
      return server;
    });
  const transition = () =>
    result.current.edit("inspector_update", {
      track_id: "video",
      clip_id: "video-second",
      changes: { transition: { type: "crossfade", duration_ms: 300 } },
    });
  try {
    await act(async () => {
      await transition();
    });
    expect(batch).toHaveBeenCalledOnce();
    expect(operation).not.toHaveBeenCalled();
    expect(server.tracks).toHaveLength(3);
    expect(result.current.undoStacks.current[project.id]).toEqual({
      undo: [10],
      redo: [],
    });
    expect(notice).toHaveBeenCalledWith(
      "Transition applied. Overlapping clips use separate tracks.",
    );
    await act(async () => {
      await result.current.edit("restore_revision", {}, "undo");
    });
    expect(server.tracks).toHaveLength(2);
    expect(client.getQueryData(keys.project(project.id))).toEqual(server);
    await act(async () => {
      await transition();
    });
    expect(batch).toHaveBeenCalledTimes(2);
    expect(server.tracks).toHaveLength(3);
    expect(server.revision).toBe(13);
    expect(result.current.undoStacks.current[project.id]).toEqual({
      undo: [12],
      redo: [],
    });
  } finally {
    unmount();
    client.clear();
  }
});

it("rolls back transition timing and companion lanes together when saving fails", async () => {
  const { result, project, client, notice, unmount } = setup(true);
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
      pending = result.current.edit("inspector_update", {
        track_id: "video",
        clip_id: "video-second",
        changes: { transition: { type: "crossfade", duration_ms: 300 } },
      });
    });
    await waitFor(() => expect(batch).toHaveBeenCalledOnce());
    const projected = client.getQueryData<ProjectSnapshot>(
      keys.project(project.id),
    )!;
    expect(projected.tracks).toHaveLength(3);
    expect(projected.tracks[0].clips[1].start_ms).toBe(3700);
    await act(async () => {
      reject(new Error("Revision conflict"));
      await pending;
    });
    expect(client.getQueryData(keys.project(project.id))).toEqual(project);
    expect(notice).toHaveBeenCalledWith("Revision conflict");
    expect(result.current.undoStacks.current[project.id]).toEqual({
      undo: [],
      redo: [],
    });
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

it("duplicates the captured selection atomically, selects every copy, and undoes the group together", async () => {
  const { result, project, client, unmount } = setup(true);
  useStudio.getState().set({
    projectId: project.id,
    selectedId: "video-second",
    selectedIds: ["video-clip", "video-second"],
  });
  let server = structuredClone(project);
  const batch = vi
    .spyOn(http.api, "batch")
    .mockImplementation(async (_id, request) => {
      expect(request.expected_revision).toBe(server.revision);
      const base = server.revision;
      server = {
        ...projectAfter(server, { steps: request.operations }),
        revision: base + 1,
      };
      return {
        project: server,
        applied_operations: request.operations.length,
        base_revision: base,
        committed: true,
      };
    });
  const operation = vi
    .spyOn(http.api, "operation")
    .mockImplementation(async (_id, request) => {
      expect(request).toMatchObject({
        type: "restore_revision",
        payload: { revision: 10 },
        expected_revision: 11,
      });
      server = { ...structuredClone(project), revision: 12 };
      return server;
    });
  try {
    await act(async () => {
      const pending = result.current.edit("duplicate_clips", {
        clip_id: "video-second",
      });
      useStudio.getState().set({ selectedId: "sound-clip", linking: false });
      await pending;
    });
    expect(batch).toHaveBeenCalledOnce();
    expect(operation).not.toHaveBeenCalled();
    expect(batch.mock.calls[0][1].operations).toHaveLength(4);
    expect(server.tracks.map((t) => t.clips.map((c) => c.start_ms))).toEqual([
      [0, 4000, 8000, 12000],
      [0, 4000, 8000, 12000],
    ]);
    expect(useStudio.getState().selectedIds).toHaveLength(4);
    expect(useStudio.getState().selectedIds).not.toContain("video-second");
    expect(result.current.undoStacks.current[project.id]).toEqual({
      undo: [10],
      redo: [],
    });
    await act(async () => {
      await result.current.edit("restore_revision", {}, "undo");
    });
    expect(server.tracks.map((t) => t.clips.length)).toEqual([2, 2]);
    expect(client.getQueryData(keys.project(project.id))).toEqual(server);
  } finally {
    unmount();
    client.clear();
  }
});

it("rolls every duplicate back on revision conflict without adding an undo entry", async () => {
  const { result, project, client, notice, unmount } = setup(true);
  useStudio.getState().set({
    projectId: project.id,
    selectedId: "video-second",
    selectedIds: ["video-clip", "video-second"],
    linking: false,
  });
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
      pending = result.current.edit("duplicate_clips", {
        clip_id: "video-second",
      });
    });
    await waitFor(() => expect(batch).toHaveBeenCalledOnce());
    const projected = client.getQueryData<ProjectSnapshot>(
      keys.project(project.id),
    )!;
    expect(projected.tracks.map((t) => t.clips.length)).toEqual([4, 2]);
    expect(projected.revision).toBe(10);
    await act(async () => {
      reject(new Error("Revision conflict"));
      await pending;
    });
    expect(client.getQueryData(keys.project(project.id))).toEqual(project);
    expect(useStudio.getState().selectedIds).toEqual([
      "video-clip",
      "video-second",
    ]);
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
