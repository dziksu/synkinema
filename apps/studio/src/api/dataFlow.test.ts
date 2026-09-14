import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { reads, keys } from "./queries";
import { writes } from "./mutations";
import { projectWrites } from "./projectMutations";
import { projectAfter } from "./projectReducer";
import { canvasInsert } from "../layerInsert";
import { deleteTimelineTrack } from "../timelineActions";
import { isOptimistic } from "./cache";
import { ApiRequestError } from "./transport";
import defaults from "./generated/defaults.json";
import type {
  Asset,
  EditStep,
  ProjectSnapshot as Project,
} from "./generated/client";
let client: QueryClient;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const makeProject = () =>
  structuredClone({
    ...defaults.project,
    id: "p",
    tracks: [
      ...defaults.project.tracks,
      {
        ...defaults.track,
        id: "layer",
        name: "Graphics",
        kind: "overlay",
        clips: [{ ...defaults.clip, id: "clip", shape: "rectangle" }],
      },
    ],
  }) as Project;
function seed(project = makeProject()) {
  client.setQueryData(keys.project(project.id), project);
  client.setQueryData(keys.projects, [project]);
  return project;
}
const edit = (steps: EditStep[], projectId = "p") =>
  client
    .getMutationCache()
    .build(client, projectWrites(client))
    .execute({ projectId, resolve: () => ({ steps }) });
const nameStep = (name: string): EditStep => ({
  type: "update_clip",
  payload: { track_id: "layer", clip_id: "clip", changes: { name } },
});
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});
it("rolls back atomic track removal on a revision conflict", async () => {
  const base = seed();
  request.mockResolvedValue(json(base));
  const response = deferred<Response>();
  request.mockReturnValueOnce(response.promise);
  const task = edit(deleteTimelineTrack(base, "layer", ["clip"]));
  const failed = expect(task).rejects.toThrow();
  await vi.waitFor(() =>
    expect(
      client
        .getQueryData<Project>(keys.project("p"))
        ?.tracks.some((t) => t.id === "layer"),
    ).toBe(false),
  );
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
    expected_revision: base.revision,
    type: "remove_track",
    payload: { track_id: "layer", remove_clips: true },
  });
  response.resolve(json({ detail: "Revision conflict" }, 409));
  await failed;
  expect(client.getQueryData<Project>(keys.project("p"))?.tracks).toEqual(
    base.tracks,
  );
});

it("rolls back track gain without leaving an invented revision", async () => {
  const base = seed();
  request.mockResolvedValue(json(base));
  const response = deferred<Response>();
  request.mockReturnValueOnce(response.promise);
  const task = edit([
    {
      type: "update_track",
      payload: { track_id: "layer", changes: { gain_db: -18 } },
    },
  ]);
  const failed = expect(task).rejects.toThrow();
  await vi.waitFor(() =>
    expect(
      client
        .getQueryData<Project>(keys.project("p"))
        ?.tracks.find((t) => t.id === "layer")?.gain_db,
    ).toBe(-18),
  );
  expect(client.getQueryData<Project>(keys.project("p"))?.revision).toBe(
    base.revision,
  );
  response.resolve(json({ detail: "Save failed" }, 500));
  await failed;
  expect(client.getQueryData<Project>(keys.project("p"))?.tracks).toEqual(
    base.tracks,
  );
});

it("deduplicates parameterized queries and forwards cancellation to generated fetch", async () => {
  const result = deferred<Response>();
  request.mockReturnValue(result.promise);
  const options = reads.assets(client, "p");
  const a = client.fetchQuery(options);
  const b = client.fetchQuery(options);
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toBe("/api/assets?project_id=p");
  const signal = request.mock.calls[0][1]?.signal;
  expect(signal).toBeInstanceOf(AbortSignal);
  result.resolve(json([]));
  await Promise.all([a, b]);
  await client.fetchQuery({ ...options, staleTime: Infinity });
  expect(request).toHaveBeenCalledOnce();
  request.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  const inFlight = client
    .fetchQuery(reads.assets(client, "another"))
    .catch((e) => e);
  await client.cancelQueries({ queryKey: keys.assets("another") });
  expect(request.mock.calls[1][1]?.signal?.aborted).toBe(true);
  await inFlight;
});
it("normalizes conflict, validation and non-JSON HTTP errors without retrying writes", async () => {
  request.mockResolvedValueOnce(
    json({ detail: "Expected revision 1, actual 2" }, 409),
  );
  const promise = client
    .getMutationCache()
    .build(client, writes.tags(client))
    .execute({ assetId: "a", tags: [] });
  await expect(promise).rejects.toMatchObject({
    status: 409,
    name: "ApiRequestError",
  });
  expect(request).toHaveBeenCalledOnce();
  request.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
  await expect(
    client.fetchQuery(reads.projects(client)),
  ).rejects.toBeInstanceOf(ApiRequestError);
});
it("uses generated multipart upload with captured destination and exposes only validated media", async () => {
  const asset = { id: "a", locations: { p: "logos" } } as unknown as Asset;
  request.mockResolvedValue(json(asset));
  const file = new File(["png"], "logo.png", { type: "image/png" });
  await client
    .getMutationCache()
    .build(client, writes.upload(client))
    .execute({
      files: [file],
      destination: { project_id: "p", folder_id: "logos" },
    });
  const [url, init] = request.mock.calls[0];
  expect(url).toBe("/api/assets");
  expect(init?.body).toBeInstanceOf(FormData);
  expect((init!.body as FormData).get("folder_id")).toBe("logos");
  expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  expect(client.getQueryData(keys.assets("p"))).toEqual([asset]);
});
it("shows two queued edits immediately, sends confirmed revisions, and prevents refetch overwrite", async () => {
  const base = seed();
  const first = deferred<Response>();
  const second = deferred<Response>();
  request
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const a = edit([nameStep("First")]);
  const b = edit([
    {
      type: "update_clip",
      payload: {
        track_id: "layer",
        clip_id: "clip",
        changes: { color: "#123456" },
      },
    },
  ]);
  await vi.waitFor(() =>
    expect(
      client.getQueryData<Project>(keys.project("p"))!.tracks.at(-1)!.clips[0],
    ).toMatchObject({ name: "First", color: "#123456" }),
  );
  expect(request).toHaveBeenCalledOnce();
  await client.fetchQuery(reads.project(client, "p"));
  expect(request).toHaveBeenCalledOnce();
  expect(
    JSON.parse(request.mock.calls[0][1]!.body as string).expected_revision,
  ).toBe(1);
  const afterFirst = {
    ...projectAfter(base, { steps: [nameStep("First")] }),
    revision: 2,
  };
  first.resolve(json(afterFirst));
  await a;
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(
    JSON.parse(request.mock.calls[1][1]!.body as string).expected_revision,
  ).toBe(2);
  expect(
    client.getQueryData<Project>(keys.project("p"))!.tracks.at(-1)!.clips[0]
      .color,
  ).toBe("#123456");
  const payload = JSON.parse(request.mock.calls[1][1]!.body as string);
  const afterSecond = {
    ...projectAfter(afterFirst, { steps: [payload] }),
    revision: 3,
  };
  second.resolve(json(afterSecond));
  await b;
  expect(client.getQueryData(keys.project("p"))).toEqual(afterSecond);
  expect(isOptimistic(client, keys.project("p"))).toBe(false);
});
it("rolls back failed creation and cancels dependent queued moves before HTTP, even offline", async () => {
  const base = seed();
  const failed = deferred<Response>();
  request.mockReturnValue(failed.promise);
  const a = edit([
    {
      type: "add_track",
      payload: { id: "new", name: "New track", kind: "overlay" },
    },
  ]);
  const b = edit([
    {
      type: "add_clip",
      payload: { track_id: "new", clip: { id: "newclip", shape: "ellipse" } },
    },
  ]);
  const results = Promise.allSettled([a, b]);
  await vi.waitFor(() =>
    expect(
      client.getQueryData<Project>(keys.project("p"))!.tracks.at(-1)!.clips[0]
        ?.id,
    ).toBe("newclip"),
  );
  failed.reject(new TypeError("Offline"));
  expect((await results).every((r) => r.status === "rejected")).toBe(true);
  expect(request).toHaveBeenCalledOnce();
  expect(client.getQueryData(keys.project("p"))).toEqual(base);
  expect(isOptimistic(client, keys.projects)).toBe(false);
});
it.each([false, true])(
  "plans rapid canvas drops against pending layers and rolls back a failed batch (%s)",
  async (fail) => {
    const base = seed();
    const first = deferred<Response>(),
      second = deferred<Response>();
    request
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const insert = () =>
      client
        .getMutationCache()
        .build(client, projectWrites(client))
        .execute({
          projectId: "p",
          resolve: (p) =>
            canvasInsert(p, [], { shape: "ellipse", start_ms: 1000 }),
        });
    const a = insert(),
      b = insert(),
      results = Promise.allSettled([a, b]);
    await vi.waitFor(() =>
      expect(
        client
          .getQueryData<Project>(keys.project("p"))!
          .tracks.filter((t) => t.kind === "overlay"),
      ).toHaveLength(3),
    );
    expect(request).toHaveBeenCalledOnce();
    const body = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(body.expected_revision).toBe(1);
    expect(body.operations.map((s: EditStep) => s.type)).toEqual([
      "add_track",
      "add_clip",
    ]);
    if (fail) {
      first.reject(new TypeError("Offline"));
      expect((await results).every((r) => r.status === "rejected")).toBe(true);
      expect(request).toHaveBeenCalledOnce();
      expect(client.getQueryData(keys.project("p"))).toEqual(base);
      return;
    }
    const one = {
      ...projectAfter(base, { steps: body.operations }),
      revision: 2,
    };
    first.resolve(json({ project: one, committed: true }));
    await a;
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    const next = JSON.parse(request.mock.calls[1][1]!.body as string);
    expect(next.expected_revision).toBe(2);
    const two = {
      ...projectAfter(one, { steps: next.operations }),
      revision: 3,
    };
    second.resolve(json({ project: two, committed: true }));
    await results;
    const clips = two.tracks
      .filter((t) => t.kind === "overlay")
      .slice(1)
      .map((t) => t.clips[0]);
    expect(clips.map((c) => c.start_ms)).toEqual([1000, 1000]);
    expect(new Set(clips.map((c) => c.id)).size).toBe(2);
    expect(client.getQueryData(keys.project("p"))).toEqual(two);
  },
);
it("recovers after a conflict and uses a freshly fetched revision for the next edit", async () => {
  seed();
  request.mockResolvedValueOnce(json({ detail: "Expected revision 1" }, 409));
  await expect(edit([nameStep("Losing write")])).rejects.toMatchObject({
    status: 409,
  });
  const remote = { ...makeProject(), name: "Agent changed it", revision: 7 };
  request.mockResolvedValueOnce(json(remote));
  await client.fetchQuery(reads.project(client, "p"));
  request.mockResolvedValueOnce(json({ ...remote, revision: 8 }));
  await edit([nameStep("New intent")]);
  expect(
    JSON.parse(request.mock.calls[2][1]!.body as string).expected_revision,
  ).toBe(7);
});
it("failed metadata writes preserve newer optimistic layers on the same asset", async () => {
  const asset = {
    id: "a",
    tags: ["old"],
    locations: { library: "" },
  } as unknown as Asset;
  client.setQueryData(keys.assets(), [asset]);
  const first = deferred<Response>();
  const second = deferred<Response>();
  request
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const a = client
    .getMutationCache()
    .build(client, writes.tags(client))
    .execute({ assetId: "a", tags: ["wrong"] });
  const b = client
    .getMutationCache()
    .build(client, writes.tags(client))
    .execute({ assetId: "a", tags: ["newer"] });
  const results = Promise.allSettled([a, b]);
  await vi.waitFor(() =>
    expect(client.getQueryData<Asset[]>(keys.assets())![0].tags).toEqual([
      "newer",
    ]),
  );
  first.reject(new TypeError("Network error"));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(client.getQueryData<Asset[]>(keys.assets())![0].tags).toEqual([
    "newer",
  ]);
  second.resolve(json({ ...asset, tags: ["newer"] }));
  await results;
  expect(client.getQueryData<Asset[]>(keys.assets())![0].tags).toEqual([
    "newer",
  ]);
});
it("restores cached history optimistically but records the next confirmed revision", async () => {
  const base = seed({ ...makeProject(), revision: 4 });
  const previous = { ...makeProject(), name: "Previous", revision: 2 };
  client.setQueryData([...keys.project("p"), 2], previous);
  const result = deferred<Response>();
  request.mockReturnValue(result.promise);
  const pending = edit([
    { type: "restore_revision", payload: { revision: 2 } },
  ]);
  await vi.waitFor(() =>
    expect(client.getQueryData<Project>(keys.project("p"))!.name).toBe(
      "Previous",
    ),
  );
  expect(client.getQueryData<Project>(keys.project("p"))!.revision).toBe(
    base.revision,
  );
  result.resolve(json({ ...previous, revision: 5 }));
  await pending;
  expect(client.getQueryData<Project>(keys.project("p"))!.revision).toBe(5);
});
it("edits a freshly fetched project even when the project-list snapshot is older", async () => {
  const base = seed();
  client.setQueryData(keys.projects, [
    { ...base, revision: 1, tracks: defaults.project.tracks },
  ]);
  const current = { ...base, revision: 5 };
  client.setQueryData(keys.project("p"), current);
  const pendingResponse = deferred<Response>();
  request.mockReturnValue(pendingResponse.promise);
  const pending = edit([nameStep("Edit new clip")]);
  await vi.waitFor(() =>
    expect(
      client.getQueryData<Project[]>(keys.projects)![0].tracks.at(-1)!.clips[0]
        .name,
    ).toBe("Edit new clip"),
  );
  pendingResponse.resolve(
    json({
      ...projectAfter(current, { steps: [nameStep("Edit new clip")] }),
      revision: 6,
    }),
  );
  await pending;
  expect(isOptimistic(client, keys.project("p"))).toBe(false);
});
