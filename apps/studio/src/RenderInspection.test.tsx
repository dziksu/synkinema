// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import RenderInspection from "./RenderInspection";
import { http } from "./api/transport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Job } from "./types";
vi.mock("./api/transport", () => ({ http: { api: { sheet: vi.fn() } } }));
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RenderInspection job={job} />
    </QueryClientProvider>,
  );
  return client;
}
const job = {
  id: "export-1",
  project_id: "project-1",
  project_name: "Przygoda",
  revision: 3,
} as Job;
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("inspects the exact export and reopens the cached sheet", async () => {
  vi.mocked(http.api.sheet).mockResolvedValue({
    path: "/sheet.jpg",
    timestamps_ms: [],
    job_id: "export-1",
    url: "/sheet.jpg",
    revision: 3,
    from_ms: 2000,
    to_ms: 4000,
  });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Inspect frames" }));
  const image = await screen.findByRole("img");
  expect(image.getAttribute("src")).toBe("/sheet.jpg");
  expect(http.api.sheet).toHaveBeenCalledWith(
    "project-1",
    { job_id: "export-1" },
    { signal: expect.any(AbortSignal) },
  );
  expect(screen.getByText(/Range: 2.00–4.00 s/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect frames" }));
  expect(http.api.sheet).toHaveBeenCalledOnce();
});
it("shows progress and allows retry after an error", async () => {
  vi.mocked(http.api.sheet).mockRejectedValueOnce(
    new Error("File unavailable"),
  );
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Inspect frames" }));
  expect(screen.getByRole("status")).toBeTruthy();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /File unavailable\s*Try again/,
  );
  vi.mocked(http.api.sheet).mockResolvedValue({
    path: "/retry.jpg",
    timestamps_ms: [],
    job_id: "export-1",
    url: "/retry.jpg",
    revision: 3,
    from_ms: 0,
    to_ms: 1000,
  });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("img").getAttribute("src")).toBe("/retry.jpg"),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});
