import { it, expect } from "vitest";
import { readRoute, routeHash } from "./navigation";
it("round trips channel detail and independent channel list routes", () => {
  const route = {
    page: "channels",
    channelId: "c-123",
    projectId: null,
  } as const;
  expect(readRoute(routeHash(route))).toEqual(route);
  expect(readRoute("#/channels")).toEqual({
    page: "channels",
    channelId: null,
    projectId: null,
  });
  expect(readRoute("#/channels/<script>").channelId).toBeNull();
});
it("reopens a project through a shareable local URL", () => {
  const route = { page: "studio", projectId: "abc123" } as const;
  expect(readRoute(routeHash(route))).toEqual(route);
});
it("handles library routes and rejects malformed project paths", () => {
  expect(readRoute("#/library")).toEqual({ page: "library", projectId: null });
  expect(readRoute("#/projects/")).toEqual({
    page: "projects",
    projectId: null,
  });
  expect(readRoute("#/projects/<script>")).toEqual({
    page: "projects",
    projectId: null,
  });
});
