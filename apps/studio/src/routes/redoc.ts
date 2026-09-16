import { proxyRequest } from "@/server/backend.server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/redoc")({
  server: { handlers: { GET: proxyRequest, HEAD: proxyRequest } },
});
