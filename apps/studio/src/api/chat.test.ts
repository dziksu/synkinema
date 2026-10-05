import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentChat } from "@/api/generated/client";
import { chatWrites } from "@/api/mutations";
import { keys, reads } from "@/api/queries";
import { http } from "@/api/transport";

afterEach(() => vi.restoreAllMocks());
const client = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
const chat = (patch: Partial<AgentChat> = {}): AgentChat => ({
  id: "topic",
  title: "Topic",
  provider: "codex",
  project_id: "project",
  project_name: "Project",
  mode: "ask",
  directory: "",
  archived: false,
  running: false,
  version: 1,
  created_at: "2026-10-05",
  updated_at: "2026-10-05",
  messages: [],
  ...patch,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("keeps newer partial/final snapshots when an acknowledgement arrives late", async () => {
  const query = client();
  const ack = deferred<AgentChat>();
  vi.spyOn(http.api, "sendAgentMessage").mockReturnValue(ack.promise);
  const mutation = new MutationObserver(query, chatWrites.send(query, "topic"));
  const pending = mutation.mutate({ text: "Hello", request_id: "once" });
  const completed = chat({
    version: 8,
    messages: [
      {
        id: "answer",
        role: "assistant",
        provider: "codex",
        text: "Complete reply",
        reasoning: "",
        progress: "",
        status: "complete",
        created_at: "2026-10-05",
        context: null,
        error: "",
        request_id: "once",
        applied_revisions: [],
      },
    ],
  });
  query.setQueryData(keys.agentChat("topic"), completed);
  query.setQueryData(keys.agentChats, [completed]);
  ack.resolve(chat({ version: 2, running: true }));
  await pending;
  expect(query.getQueryData(keys.agentChat("topic"))).toEqual(completed);
  expect(query.getQueryData<AgentChat[]>(keys.agentChats)?.[0].version).toBe(8);
  query.clear();
});

it("never lets an older GET overwrite a later completed snapshot", async () => {
  const query = client();
  const result = deferred<AgentChat>();
  vi.spyOn(http.api, "agentChat").mockReturnValue(result.promise);
  const pending = query.fetchQuery(reads.agentChat(query, "topic"));
  const next = chat({ version: 10 });
  query.setQueryData(keys.agentChat("topic"), next);
  result.resolve(chat({ version: 3, running: true }));
  expect(await pending).toEqual(next);
  query.clear();
});

it("rolls back a failed rename without discarding a later independent directory draft", async () => {
  const query = client();
  query.setQueryData(keys.agentChat("topic"), chat());
  query.setQueryData(keys.agentChats, [chat()]);
  const first = deferred<AgentChat>(),
    second = deferred<AgentChat>();
  const api = vi
    .spyOn(http.api, "updateAgentChat")
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const a = new MutationObserver(query, chatWrites.update(query, "topic"));
  const b = new MutationObserver(query, chatWrites.update(query, "topic"));
  const failed = a
    .mutate({ expected_version: 1, title: "Rename" })
    .catch((error) => error);
  const later = b.mutate({ expected_version: 1, directory: "/sources" });
  await vi.waitFor(() =>
    expect(
      query.getQueryData<AgentChat>(keys.agentChat("topic"))?.directory,
    ).toBe("/sources"),
  );
  expect(query.getQueryData<AgentChat>(keys.agentChat("topic"))?.version).toBe(
    1,
  );
  const poll = vi.spyOn(http.api, "agentChat");
  expect((await query.fetchQuery(reads.agentChat(query, "topic"))).title).toBe(
    "Rename",
  );
  expect(poll).not.toHaveBeenCalled();
  first.reject(new Error("Version conflict"));
  await failed;
  expect(query.getQueryData<AgentChat>(keys.agentChat("topic"))).toMatchObject({
    title: "Topic",
    directory: "/sources",
    version: 1,
  });
  await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  second.resolve(chat({ directory: "/sources", version: 2 }));
  await later;
  expect(query.getQueryData(keys.agentChat("topic"))).toEqual(
    chat({ directory: "/sources", version: 2 }),
  );
  query.clear();
});

it("forwards cancellation and scopes the model catalog to saved settings", async () => {
  const query = client();
  let signal: AbortSignal | undefined;
  vi.spyOn(http.api, "agentChat").mockImplementation((_id, params) => {
    signal = params?.signal as AbortSignal;
    return new Promise(() => {});
  });
  const request = query
    .fetchQuery(reads.agentChat(query, "one"))
    .catch(() => null);
  await query.cancelQueries({ queryKey: keys.agentChat("one") });
  await request;
  expect(signal?.aborted).toBe(true);
  expect(keys.agentChat("one")).not.toEqual(keys.agentChat("two"));
  expect(keys.agentModels(1, "codex")).not.toEqual(
    keys.agentModels(2, "/custom/codex"),
  );
  query.clear();
});

it("reorders only the supplied chats and protects the projection from polling", async () => {
  const query = client();
  const a = chat({ id: "a" }),
    hidden = chat({ id: "hidden", archived: true }),
    b = chat({ id: "b" });
  query.setQueryData(keys.agentChats, [a, hidden, b]);
  const result = deferred<AgentChat[]>();
  const api = vi
    .spyOn(http.api, "orderAgentChats")
    .mockReturnValue(result.promise);
  const poll = vi.spyOn(http.api, "agentChats");
  const mutation = new MutationObserver(query, chatWrites.order(query));
  const pending = mutation.mutate({ chat_ids: ["b", "a"] });
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith({ chat_ids: ["b", "a"] }),
  );
  expect(
    (await query.fetchQuery(reads.agentChats(query))).map((item) => item.id),
  ).toEqual(["b", "hidden", "a"]);
  expect(poll).not.toHaveBeenCalled();
  result.resolve([b, hidden, a]);
  await pending;
  expect(query.getQueryData(keys.agentChats)).toEqual([b, hidden, a]);
  query.clear();
});

it("rolls back a rejected drag without undoing a later confirmed rename", async () => {
  const query = client();
  const a = chat({ id: "a" }),
    hidden = chat({ id: "hidden", archived: true }),
    b = chat({ id: "b" });
  query.setQueryData(keys.agentChats, [a, hidden, b]);
  const result = deferred<AgentChat[]>();
  vi.spyOn(http.api, "orderAgentChats").mockReturnValue(result.promise);
  const order = new MutationObserver(query, chatWrites.order(query));
  const pending = order
    .mutate({ chat_ids: ["b", "a"] })
    .catch((error) => error);
  await vi.waitFor(() =>
    expect(query.getQueryData<AgentChat[]>(keys.agentChats)?.[0].id).toBe("b"),
  );
  const renamed = { ...b, version: 2, title: "Saved rename" };
  vi.spyOn(http.api, "updateAgentChat").mockResolvedValue(renamed);
  await new MutationObserver(query, chatWrites.update(query, "b")).mutate({
    expected_version: 1,
    title: renamed.title,
  });
  result.reject(new Error("Order rejected"));
  await pending;
  expect(
    query
      .getQueryData<AgentChat[]>(keys.agentChats)
      ?.map(({ id, title, version }) => ({ id, title, version })),
  ).toEqual(
    [a, hidden, renamed].map(({ id, title, version }) => ({
      id,
      title,
      version,
    })),
  );
  query.clear();
});

it("invalidates the editor and revision history after a committed agent edit", async () => {
  const query = client();
  query.setQueryData(keys.project("project"), { revision: 1 });
  query.setQueryData(keys.history("project"), []);
  const next = chat({
    version: 4,
    messages: [
      {
        id: "answer",
        role: "assistant",
        provider: "codex",
        text: "Saved",
        reasoning: "",
        progress: "",
        status: "complete",
        created_at: "2026-10-05",
        context: null,
        error: "",
        request_id: "once",
        applied_revisions: [2],
      },
    ],
  });
  vi.spyOn(http.api, "agentChat").mockResolvedValue(next);
  await query.fetchQuery(reads.agentChat(query, "topic"));
  expect(query.getQueryState(keys.project("project"))?.isInvalidated).toBe(
    true,
  );
  expect(query.getQueryState(keys.history("project"))?.isInvalidated).toBe(
    true,
  );
  query.setQueryData(keys.project("project"), { revision: 2 });
  query.setQueryData(keys.history("project"), []);
  query.setQueryData(keys.agentChat("topic"), chat());
  vi.spyOn(http.api, "sendAgentMessage").mockResolvedValue(next);
  const retry = new MutationObserver(query, chatWrites.send(query, "topic"));
  await retry.mutate({ text: "Previously accepted", request_id: "once" });
  expect(query.getQueryState(keys.project("project"))?.isInvalidated).toBe(
    true,
  );
  expect(query.getQueryState(keys.history("project"))?.isInvalidated).toBe(
    true,
  );
  query.clear();
});
