import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { writes } from "./mutations";
import { reads, keys } from "./queries";
import defaults from "./generated/defaults.json";
import type {
  ProjectSnapshot as Project,
  RenderJob as Job,
} from "./generated/client";
const clients: QueryClient[] = [];
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const p = { ...defaults.project, id: "p", duration_ms: 0 } as Project;
const job = (id: string, project_id = "p") =>
  ({ id, project_id, status: "completed" }) as Job;
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(keys.projects, [p, { ...p, id: "other" }]);
  client.setQueryData(keys.project("p"), p);
  client.setQueryData(keys.jobs, [job("a"), job("b", "other")]);
  client.setQueryData(keys.projectJobs("p"), [job("a")]);
  return client;
}
afterEach(() => {
  for (const client of clients) client.clear();
  vi.unstubAllGlobals();
});
it("rolls a failed deletion back in global and project queues without retrying HTTP", async () => {
  const client = setup();
  let reject!: (e: Error) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((_, r) => {
        reject = r;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const done = client
    .getMutationCache()
    .build(client, writes.deleteJobs(client))
    .execute({ job_ids: ["a"] })
    .catch((e) => e);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(client.getQueryData<Job[]>(keys.jobs)?.map((j) => j.id)).toEqual([
    "b",
  ]);
  expect(client.getQueryData(keys.projectJobs("p"))).toEqual([]);
  reject(new Error("Offline"));
  await done;
  expect(client.getQueryData<Job[]>(keys.jobs)?.map((j) => j.id)).toEqual([
    "a",
    "b",
  ]);
  expect(
    client.getQueryData<Job[]>(keys.projectJobs("p"))?.map((j) => j.id),
  ).toEqual(["a"]);
  expect(fetch).toHaveBeenCalledOnce();
});
it("purges deleted project, media, history, export and inspection caches only after acknowledgement", async () => {
  const client = setup();
  for (const key of [
    ["history", "p", 1],
    ["inspection", "p", "sheet"],
    ["assets", "p"],
    ["asset-folders", "p"],
    ["captions", "p", 1],
  ])
    client.setQueryData(key, []);
  client.setQueryData(["project", "p", 1], p);
  client.setQueryData(keys.project("other"), { ...p, id: "other" });
  client.setQueryData(["server-state"], {
    projects: [{ id: "p", revision: 1 }],
    jobs: [job("a")],
  });
  let resolve!: (v: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const done = client
    .getMutationCache()
    .build(client, writes.deleteProject(client))
    .execute(p);
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  expect(client.getQueryData(keys.project("p"))).toBeDefined();
  resolve(
    json({
      job_ids: ["a"],
      project_ids: ["p"],
      asset_ids: [],
      deleted_files: 1,
      freed_bytes: 123,
      pending_files: 0,
    }),
  );
  await done;
  expect(client.getQueryData(keys.project("p"))).toBeUndefined();
  expect(client.getQueryData(["project", "p", 1])).toBeUndefined();
  expect(client.getQueryData(keys.projectJobs("p"))).toBeUndefined();
  expect(client.getQueryData(["assets", "p"])).toBeUndefined();
  expect(client.getQueryData(["server-state"])).toEqual({
    projects: [],
    jobs: [],
  });
  expect(client.getQueryData(keys.project("other"))).toBeDefined();
  expect(client.getQueryData<Job[]>(keys.jobs)?.map((j) => j.id)).toEqual([
    "b",
  ]);
});
it("rejects stale project deletion and restores its card", async () => {
  const client = setup();
  const fetch = vi.fn(() =>
    Promise.resolve(json({ detail: "Project changed" }, 409)),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(
    client
      .getMutationCache()
      .build(client, writes.deleteProject(client))
      .execute(p),
  ).rejects.toThrow();
  expect(
    client.getQueryData<Project[]>(keys.projects)?.some((v) => v.id === "p"),
  ).toBe(true);
  expect(client.getQueryData(keys.project("p"))).toBeDefined();
  expect(fetch).toHaveBeenCalledOnce();
});
it("scopes project jobs at the server before its display limit", async () => {
  const client = setup();
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(json([job("old")])),
  );
  vi.stubGlobal("fetch", fetch);
  const jobs = await client.fetchQuery(reads.jobs(client, "p"));
  expect(fetch.mock.calls[0][0]).toBe("/api/jobs?project_id=p");
  expect(jobs[0].id).toBe("old");
});

it("normalizes an absent project scope during library invalidation", async () => {
  const client = setup();
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(json([])));
  vi.stubGlobal("fetch", fetch);
  await client.fetchQuery(reads.assets(client, null));
  await client.fetchQuery(reads.folders(client, null));
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/assets",
    "/api/asset-folders",
  ]);
  expect(reads.assets(client, null).queryKey).toEqual(
    reads.assets(client).queryKey,
  );
});
