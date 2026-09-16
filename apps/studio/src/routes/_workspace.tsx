import { WorkspaceShell } from "@/components/workspace-shell";
import { workspaceSearchSchema } from "@/lib/workspace-search";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace")({
  ssr: true,
  validateSearch: workspaceSearchSchema,
  component: WorkspaceShell,
});
