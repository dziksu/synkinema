import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  peer: "127.0.0.1" as string | undefined,
  headers: new Headers({ host: "localhost:43817" }),
  upstream: vi.fn(),
  getIP: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => mocks.headers,
  getRequestIP: (options: unknown) => {
    mocks.getIP(options);
    return mocks.peer;
  },
}));
vi.mock("undici", () => ({ request: mocks.upstream }));

import { backendFetch } from "./backend.server";
import { localChatPeer } from "./local-chat-access";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.peer = "127.0.0.1";
  mocks.headers = new Headers({ host: "localhost:43817" });
});

it.each(["127.0.0.1", "127.0.0.2", "::1", "::ffff:127.0.0.1"])(
  "accepts native loopback %s without deployment configuration",
  (peer) => expect(localChatPeer(peer, {})).toBe(true),
);

it("allows Docker's exact gateway only when the public port is loopback-bound", async () => {
  vi.stubEnv("SYNKINEMA_PUBLISHED_BIND_HOST", "127.0.0.1");
  vi.stubEnv("SYNKINEMA_AGENT_CHAT_PROXY_PEER", "172.19.0.1");
  mocks.peer = "::ffff:172.19.0.1";
  mocks.headers.set("x-forwarded-for", "192.168.1.20");
  mocks.upstream.mockResolvedValue({
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: Readable.from([Buffer.from("{}")]),
  });
  const response = await backendFetch("/api/agent-chat/settings", {
    headers: mocks.headers,
  });
  expect(response.status).toBe(200);
  await response.text();
  expect(mocks.getIP).toHaveBeenCalledWith({ xForwardedFor: false });
  const headers = mocks.upstream.mock.calls[0][1].headers;
  expect(headers.host).toBe("localhost:43817");
  expect(headers["x-forwarded-for"]).toBeUndefined();
});

it.each([
  ["192.168.1.20", "127.0.0.1"],
  ["172.19.0.2", "127.0.0.1"],
  [undefined, "127.0.0.1"],
  ["172.19.0.1", "0.0.0.0"],
  ["172.19.0.1", "::"],
  ["172.19.0.1", ""],
])(
  "rejects peer %s with publication %s even with forged local headers",
  async (peer, bind) => {
    vi.stubEnv("SYNKINEMA_PUBLISHED_BIND_HOST", bind);
    vi.stubEnv("SYNKINEMA_AGENT_CHAT_PROXY_PEER", "172.19.0.1");
    mocks.peer = peer;
    mocks.headers.set("x-forwarded-for", "127.0.0.1");
    const response = await backendFetch("/api/agent-chat/settings");
    expect(response.status).toBe(403);
    expect(mocks.upstream).not.toHaveBeenCalled();
  },
);
