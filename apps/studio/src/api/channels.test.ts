import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { reads, keys } from "./queries";
import { writes } from "./mutations";
import { projectWrites } from "./projectMutations";
import defaults from "./generated/defaults.json";
import type {
  Channel,
  ChannelDetail,
  ChannelUpdate,
  ProjectSnapshot,
} from "./generated/client";

let client: QueryClient;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
const channel = {
  ...defaults.channel,
  id: "channel",
  name: "Gaming",
  version: 4,
  voice_gender: "male",
} as Channel;
const detail: ChannelDetail = {
  channel,
  projects: [],
  publications: [],
  reviews: [],
};
function update(name: string): ChannelUpdate {
  const {
    id: _id,
    version,
    created_at: _c,
    updated_at: _u,
    ...input
  } = channel;
  return { ...input, name, expected_version: version };
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(keys.channels, [channel]);
  client.setQueryData(keys.channel(channel.id), detail);
  request = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

it("uses scoped generated reads with cancellation and live refresh", async () => {
  request.mockResolvedValue(json(detail));
  const controller = new AbortController();
  const options = reads.channel(client, "channel");
  await options.queryFn!({ signal: controller.signal } as never);
  expect(request.mock.calls[0][0]).toBe("/api/channels/channel");
  expect(request.mock.calls[0][1]?.signal).toBe(controller.signal);
  expect(options.queryKey).not.toEqual(reads.channel(client, "other").queryKey);
  expect(reads.project(client, "p", 1).refetchInterval).toBe(10000);
});

it("rolls channel edits back on conflict without polls erasing the draft projection", async () => {
  const response = deferred<Response>();
  request.mockReturnValueOnce(response.promise);
  const task = client
    .getMutationCache()
    .build(client, writes.updateChannel(client))
    .execute({ channelId: channel.id, request: update("New direction") });
  const failed = expect(task).rejects.toThrow();
  await vi.waitFor(() =>
    expect(
      client.getQueryData<ChannelDetail>(keys.channel(channel.id))?.channel
        .name,
    ).toBe("New direction"),
  );
  expect(
    client.getQueryData<ChannelDetail>(keys.channel(channel.id))?.channel
      .version,
  ).toBe(4);
  const read = reads.channel(client, channel.id);
  const polled = await read.queryFn!({
    signal: new AbortController().signal,
  } as never);
  expect(polled.channel.name).toBe("New direction");
  expect(request).toHaveBeenCalledTimes(1);
  response.resolve(json({ detail: "Channel version conflict" }, 409));
  await failed;
  expect(client.getQueryData(keys.channel(channel.id))).toEqual(detail);
  expect(client.getQueryData(keys.channels)).toEqual([channel]);
  expect(request).toHaveBeenCalledTimes(1);
});

it("preserves a later independent channel edit when an earlier one fails", async () => {
  const other = { ...channel, id: "other" };
  client.setQueryData(keys.channels, [channel, other]);
  client.setQueryData(keys.channel("other"), { ...detail, channel: other });
  const first = deferred<Response>();
  request
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(json({ ...other, name: "New other", version: 5 }));
  const a = client
    .getMutationCache()
    .build(client, writes.updateChannel(client))
    .execute({ channelId: channel.id, request: update("Failed") });
  const failed = expect(a).rejects.toThrow();
  const b = client
    .getMutationCache()
    .build(client, writes.updateChannel(client))
    .execute({ channelId: "other", request: update("New other") });
  await vi.waitFor(() =>
    expect(client.getQueryData<Channel[]>(keys.channels)?.[1].name).toBe(
      "New other",
    ),
  );
  first.resolve(json({ detail: "Conflict" }, 409));
  await failed;
  await b;
  expect(
    client.getQueryData<Channel[]>(keys.channels)?.map((c) => c.name),
  ).toEqual(["Gaming", "New other"]);
});

it("invalidates project guidance and channel relationships after confirmed writes", async () => {
  const invalidate = vi.spyOn(client, "invalidateQueries");
  request.mockResolvedValue(json({ ...channel, name: "Saved", version: 5 }));
  await client
    .getMutationCache()
    .build(client, writes.updateChannel(client))
    .execute({ channelId: channel.id, request: update("Saved") });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.projects });
  expect(
    client.getQueryData<ChannelDetail>(keys.channel(channel.id))?.channel
      .version,
  ).toBe(5);
});

it("rolls back project unlinking with the original context and confirmed revision", async () => {
  const p = {
    ...defaults.project,
    id: "p",
    revision: 3,
    channel_id: channel.id,
    channel_context: { channel, recent_reviews: [], guidance: "Live rules" },
  } as ProjectSnapshot;
  client.setQueryData(keys.project("p"), p);
  client.setQueryData(keys.projects, [p]);
  const response = deferred<Response>();
  request.mockReturnValueOnce(response.promise);
  const task = client
    .getMutationCache()
    .build(client, projectWrites(client))
    .execute({
      projectId: "p",
      resolve: () => ({
        steps: [{ type: "update_project", payload: { channel_id: null } }],
      }),
    });
  const failed = expect(task).rejects.toThrow();
  await vi.waitFor(() =>
    expect(
      client.getQueryData<ProjectSnapshot>(keys.project("p"))?.channel_id,
    ).toBeNull(),
  );
  expect(
    client.getQueryData<ProjectSnapshot>(keys.project("p"))?.channel_context,
  ).toBeNull();
  expect(
    JSON.parse(String(request.mock.calls[0][1]?.body)).expected_revision,
  ).toBe(3);
  response.resolve(json({ detail: "Revision conflict" }, 409));
  await failed;
  expect(client.getQueryData(keys.project("p"))).toEqual(p);
});
