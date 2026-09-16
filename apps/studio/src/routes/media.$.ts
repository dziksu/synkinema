import { proxyRequest } from "@/server/backend.server";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: proxyRequest,
      HEAD: proxyRequest,
      POST: proxyRequest,
      PUT: proxyRequest,
      PATCH: proxyRequest,
      DELETE: proxyRequest,
      OPTIONS: proxyRequest,
    },
  },
});
