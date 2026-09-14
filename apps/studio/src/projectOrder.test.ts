import { expect, it } from "vitest";
import { projectsByCreatedAt } from "./projectOrder";

it("orders newest-created first regardless of recent edits without mutating cache data", () => {
  const projects = [
    {
      id: "old",
      created_at: "2026-09-10T10:00:00Z",
      updated_at: "2026-09-14T12:00:00Z",
    },
    {
      id: "new",
      created_at: "2026-09-14T09:00:00Z",
      updated_at: "2026-09-14T09:00:00Z",
    },
    {
      id: "middle",
      created_at: "2026-09-12T10:00:00Z",
      updated_at: "2026-09-12T10:00:00Z",
    },
  ];
  expect(projectsByCreatedAt(projects).map((p) => p.id)).toEqual([
    "new",
    "middle",
    "old",
  ]);
  expect(projects.map((p) => p.id)).toEqual(["old", "new", "middle"]);
});

it("compares actual timestamps across offsets and uses a stable tie-breaker", () => {
  expect(
    projectsByCreatedAt([
      { id: "b", created_at: "2026-09-14T10:00:00+02:00" },
      { id: "c", created_at: "2026-09-14T09:00:00Z" },
      { id: "a", created_at: "2026-09-14T08:00:00Z" },
    ]).map((p) => p.id),
  ).toEqual(["c", "a", "b"]);
});

it("handles empty lists and missing legacy timestamps", () => {
  expect(projectsByCreatedAt([])).toEqual([]);
  expect(
    projectsByCreatedAt([
      { id: "missing", created_at: "" },
      { id: "new", created_at: "2026-09-14T09:00:00Z" },
    ]).map((p) => p.id),
  ).toEqual(["new", "missing"]);
});
