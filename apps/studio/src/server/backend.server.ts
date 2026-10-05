import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeaders, getRequestIP } from "@tanstack/react-start/server";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { request as upstreamRequest, type Dispatcher } from "undici";
import { localChatPeer } from "./local-chat-access";

const hopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
];
function backendOrigin() {
  const url = new URL(
    process.env.SYNKINEMA_API_ORIGIN || "http://127.0.0.1:8080",
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/"
  )
    throw new Error(
      "SYNKINEMA_API_ORIGIN must be an HTTP origin without credentials or a path.",
    );
  return url.origin;
}
/** Raw HTTP is restricted to this server boundary and the generated transport. */
export const backendFetch = createServerOnlyFn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const local = new URL(requestUrl, "http://studio.local");
    if (local.pathname.startsWith("/api/agent-chat/")) {
      const peer = getRequestIP({ xForwardedFor: false });
      if (!localChatPeer(peer))
        return Response.json(
          { detail: "Agent chat requires a local connection" },
          { status: 403 },
        );
    }
    if (
      !/^\/(api|media|mcp)(\/|$)/.test(local.pathname) &&
      !["/redoc", "/docs/oauth2-redirect"].includes(local.pathname)
    )
      throw new Error("Unsupported backend path");
    const headers = new Headers(init?.headers);
    const incoming = getRequestHeaders();
    for (const key of ["cookie", "authorization"]) {
      const value = incoming.get(key);
      if (value && !headers.has(key)) headers.set(key, value);
    }
    for (const key of hopHeaders) headers.delete(key);
    // Preserve the public host for the engine's trusted-host and LAN origin checks.
    // Never forward client-supplied proxy headers to the private loopback engine.
    for (const key of [...headers.keys()]) {
      if (key === "forwarded" || key.startsWith("x-forwarded-"))
        headers.delete(key);
    }
    const host = incoming.get("host");
    if (host) headers.set("host", host);
    headers.set("accept-encoding", "identity");
    const upstream = new Request(
      new URL(local.pathname + local.search, backendOrigin()),
      {
        ...init,
        headers,
        redirect: "manual",
      },
    );
    // Undici's request API retains Host; Fetch deliberately discards it.
    const response = await upstreamRequest(upstream.url, {
      method: upstream.method as Dispatcher.HttpMethod,
      headers: Object.fromEntries(upstream.headers),
      body: upstream.body
        ? Readable.fromWeb(upstream.body as NodeReadableStream<Uint8Array>)
        : undefined,
      signal: upstream.signal,
      bodyTimeout: 0,
    });
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (Array.isArray(value))
        for (const item of value) responseHeaders.append(key, item);
      else if (value !== undefined) responseHeaders.set(key, value);
    }
    const empty =
      upstream.method === "HEAD" ||
      [204, 205, 304].includes(response.statusCode);
    if (empty) await response.body.dump();
    return new Response(
      empty
        ? null
        : (Readable.toWeb(response.body) as ReadableStream<Uint8Array>),
      {
        status: response.statusCode,
        headers: responseHeaders,
      },
    );
  },
);
/** Streams uploads and media Range responses without buffering. */
export const proxyRequest = createServerOnlyFn(
  async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (
        (origin && origin !== url.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return Response.json(
          { detail: "Cross-origin writes are not allowed" },
          { status: 403 },
        );
    }
    try {
      const init: RequestInit & { duplex?: "half" } = {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
      };
      if (!["GET", "HEAD"].includes(request.method) && request.body) {
        init.body = request.body;
        init.duplex = "half";
      }
      const response = await backendFetch(url, init);
      const headers = new Headers(response.headers);
      for (const key of hopHeaders.filter((key) => key !== "content-length"))
        headers.delete(key);
      const location = headers.get("location");
      if (location) {
        const redirect = new URL(location, backendOrigin());
        if (
          redirect.origin !== backendOrigin() &&
          redirect.origin !== url.origin
        ) {
          await response.body?.cancel();
          return Response.json(
            { detail: "Unexpected upstream redirect" },
            { status: 502 },
          );
        }
        headers.set("location", redirect.pathname + redirect.search);
      }
      if (url.pathname.startsWith("/api/"))
        headers.set("cache-control", "private, no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      if (request.signal.aborted) throw error;
      return Response.json(
        {
          detail:
            "The Synkinema engine is unavailable. Check that the backend is running.",
        },
        { status: 502 },
      );
    }
  },
);
