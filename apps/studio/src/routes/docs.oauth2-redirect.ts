import { proxyRequest } from "@/server/backend.server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/oauth2-redirect")({
  server: { handlers: { GET: proxyRequest, HEAD: proxyRequest } },
});
