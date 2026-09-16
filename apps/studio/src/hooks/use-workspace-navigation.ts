import type { WorkspaceSearch } from "@/lib/workspace-search";
import { useNavigate, useSearch } from "@tanstack/react-router";

export function useWorkspaceNavigation() {
  const search = useSearch({ from: "/_workspace" });
  const navigate = useNavigate();
  const updateSearch = (patch: Partial<WorkspaceSearch>) =>
    navigate({
      to: ".",
      search: (previous) => ({ ...previous, ...patch }),
      resetScroll: false,
    });
  return { search, updateSearch };
}
