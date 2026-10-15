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
import { useProjectEditing } from "./use-project-editing";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const project = {
    ...structuredClone(defaults.project),
    id: "rapid-history",
    name: "A",
    revision: 1,
  } as ProjectSnapshot;
  let server = project;
  const revisions = new Map([[1, project]]);
  let nextGate: Promise<void> | undefined;
  const operation = vi
    .spyOn(http.api, "operation")
    .mockImplementation(async (_id, request) => {
      const gate = nextGate;
      nextGate = undefined;
      await gate;
      expect(request.expected_revision).toBe(server.revision);
      server = {
        ...projectAfter(server, {
          steps: [request],
          restored:
            request.type === "restore_revision"
              ? revisions.get(request.payload.revision)
              : undefined,
        }),
        revision: server.revision + 1,
      };
      revisions.set(server.revision, structuredClone(server));
      return server;
    });
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
  return {
    ...hook,
    client,
    operation,
    notice,
    server: () => server,
    blockNext: () => {
      let release!: () => void;
      nextGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    dispose: () => {
      hook.unmount();
      client.clear();
    },
  };
}

it("applies each rapid Undo and Redo to the preceding settled history entry", async () => {
  const test = setup();
  try {
    for (const name of ["B", "C", "D"])
      await act(async () => {
        await test.result.current.edit("update_project", { name });
      });
    for (const [direction, expected] of [
      ["undo", "A"],
      ["redo", "D"],
    ] as const) {
      const calls = test.operation.mock.calls.length;
      const release = test.blockNext();
      let pending: ReturnType<typeof test.result.current.edit>[] = [];
      act(() => {
        pending = Array.from({ length: 3 }, () =>
          test.result.current.edit("restore_revision", {}, direction),
        );
      });
      expect(test.result.current.operation.isPending).toBe(true);
      await waitFor(() =>
        expect(test.operation).toHaveBeenCalledTimes(calls + 1),
      );
      await act(async () => {
        release();
        await Promise.all(pending);
      });
      expect(test.server().name).toBe(expected);
      await waitFor(() =>
        expect(test.result.current.operation.isPending).toBe(false),
      );
      expect(test.notice).not.toHaveBeenCalled();
    }
  } finally {
    test.dispose();
  }
});

it("waits for a pending field save before choosing the revision to undo", async () => {
  const test = setup();
  try {
    await act(async () => {
      await test.result.current.edit("update_project", { name: "B" });
    });
    const release = test.blockNext();
    let save: ReturnType<typeof test.result.current.edit>;
    let undo: ReturnType<typeof test.result.current.edit>;
    act(() => {
      save = test.result.current.edit("update_project", { name: "C" });
      undo = test.result.current.edit("restore_revision", {}, "undo");
    });
    await waitFor(() => expect(test.operation).toHaveBeenCalledTimes(2));
    await act(async () => {
      release();
      await Promise.all([save, undo]);
    });
    expect(test.server().name).toBe("B");
    expect(test.notice).not.toHaveBeenCalled();
  } finally {
    test.dispose();
  }
});

it("keeps a new edit ordered after Undo and clears the abandoned redo branch", async () => {
  const test = setup();
  try {
    for (const name of ["B", "C"])
      await act(async () => {
        await test.result.current.edit("update_project", { name });
      });
    const release = test.blockNext();
    let pending: ReturnType<typeof test.result.current.edit>[] = [];
    act(() => {
      pending = [
        test.result.current.edit("restore_revision", {}, "undo"),
        test.result.current.edit("update_project", { name: "D" }),
      ];
    });
    await waitFor(() => expect(test.operation).toHaveBeenCalledTimes(3));
    await act(async () => {
      release();
      await Promise.all(pending);
    });
    expect(test.server().name).toBe("D");
    expect(
      test.result.current.undoStacks.current["rapid-history"].redo,
    ).toEqual([]);
    await act(async () => {
      await test.result.current.edit("restore_revision", {}, "undo");
    });
    expect(test.server().name).toBe("B");
    expect(test.notice).not.toHaveBeenCalled();
  } finally {
    test.dispose();
  }
});

it("cancels a queued Undo after a save failure without consuming an older history entry", async () => {
  const test = setup();
  try {
    await act(async () => {
      await test.result.current.edit("update_project", { name: "B" });
    });
    let reject!: (error: Error) => void;
    test.operation.mockImplementationOnce(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        }),
    );
    let pending: ReturnType<typeof test.result.current.edit>[] = [];
    act(() => {
      pending = [
        test.result.current.edit("update_project", { name: "C" }),
        test.result.current.edit("restore_revision", {}, "undo"),
      ];
    });
    await waitFor(() => expect(test.operation).toHaveBeenCalledTimes(2));
    await act(async () => {
      reject(new Error("Revision conflict"));
      await Promise.all(pending);
    });
    expect(test.operation).toHaveBeenCalledTimes(2);
    expect(test.server().name).toBe("B");
    expect(
      test.client.getQueryData<ProjectSnapshot>(keys.project("rapid-history"))
        ?.name,
    ).toBe("B");
    expect(test.result.current.undoStacks.current["rapid-history"]).toEqual({
      undo: [1],
      redo: [],
    });
    await act(async () => {
      await test.result.current.edit("restore_revision", {}, "undo");
    });
    expect(test.server().name).toBe("A");
  } finally {
    test.dispose();
  }
});

it("still projects consecutive ordinary edits while an earlier save is pending", async () => {
  const test = setup();
  try {
    const release = test.blockNext();
    let pending: ReturnType<typeof test.result.current.edit>[] = [];
    act(() => {
      pending = [
        test.result.current.edit("update_project", { name: "B" }),
        test.result.current.edit("update_project", { name: "C" }),
      ];
    });
    await waitFor(() =>
      expect(
        test.client.getQueryData<ProjectSnapshot>(keys.project("rapid-history"))
          ?.name,
      ).toBe("C"),
    );
    expect(test.server().name).toBe("A");
    expect(test.operation).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await Promise.all(pending);
    });
    expect(test.server().name).toBe("C");
  } finally {
    test.dispose();
  }
});

it("cancels edits queued after a failed Undo and preserves the confirmed history", async () => {
  const test = setup();
  try {
    await act(async () => {
      await test.result.current.edit("update_project", { name: "B" });
    });
    let reject!: (error: Error) => void;
    test.operation.mockImplementationOnce(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        }),
    );
    let pending: ReturnType<typeof test.result.current.edit>[] = [];
    act(() => {
      pending = [
        test.result.current.edit("restore_revision", {}, "undo"),
        test.result.current.edit("update_project", { name: "C" }),
      ];
    });
    await waitFor(() => expect(test.operation).toHaveBeenCalledTimes(2));
    await act(async () => {
      reject(new Error("Revision conflict"));
      await Promise.all(pending);
    });
    expect(test.operation).toHaveBeenCalledTimes(2);
    expect(test.server().name).toBe("B");
    expect(
      test.client.getQueryData<ProjectSnapshot>(keys.project("rapid-history"))
        ?.name,
    ).toBe("B");
    expect(test.result.current.undoStacks.current["rapid-history"]).toEqual({
      undo: [1],
      redo: [],
    });
    await waitFor(() =>
      expect(test.result.current.operation.isPending).toBe(false),
    );
    await act(async () => {
      await test.result.current.edit("update_project", { name: "D" });
    });
    expect(test.server().name).toBe("D");
  } finally {
    test.dispose();
  }
});
