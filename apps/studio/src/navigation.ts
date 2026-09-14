export type Page =
  | "projects"
  | "studio"
  | "library"
  | "renders"
  | "settings"
  | "channels";
export type Route = {
  page: Page;
  projectId: string | null;
  channelId?: string | null;
};
export function readRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "channels")
    return {
      page: "channels",
      projectId: null,
      channelId: /^[a-zA-Z0-9_-]+$/.test(parts[1] || "") ? parts[1] : null,
    };
  if (parts[0] === "projects" && /^[a-zA-Z0-9_-]+$/.test(parts[1] || ""))
    return { page: "studio", projectId: parts[1] };
  if (["library", "renders", "settings"].includes(parts[0]))
    return { page: parts[0] as Page, projectId: null };
  return { page: "projects", projectId: null };
}
export function routeHash(route: Route) {
  if (route.page === "channels")
    return route.channelId ? `#/channels/${route.channelId}` : "#/channels";
  return route.page === "studio" && route.projectId
    ? `#/projects/${route.projectId}`
    : `#/${route.page === "studio" ? "projects" : route.page}`;
}
