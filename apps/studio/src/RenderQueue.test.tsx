// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RenderQueue from "./RenderQueue";
import type { Job } from "./types";
import defaults from "./api/generated/defaults.json";
import ProjectManager from "./ProjectManager";
import type { Project } from "./types";
const clients: QueryClient[] = [];
const jobs = ["Forest", "Sea"].map((name, i) => ({
  id: `job${i}`,
  project_id: "p",
  project_name: name,
  revision: i + 1,
  status: "completed",
  progress: 1,
  created_at: "2026-09-12T10:00:00Z",
  request: { quality: "preview", from_ms: 0, to_ms: null },
  output_url: `/media/renders/job${i}.mp4`,
})) as Job[];
function mount(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("shows the actual rendering stage and elapsed time without inventing progress", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T10:02:20Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        json({ pending_files: 0, deleted_files: 0, freed_bytes: 0 }),
      ),
    ),
  );
  mount(
    <RenderQueue
      jobs={[
        {
          ...jobs[0],
          status: "running",
          progress: 0.81,
          phase: "Compositing timeline",
          started_at: "2026-09-12T10:00:00Z",
          output_url: null,
        },
      ]}
    />,
  );
  const preview = screen.getByRole("complementary", { name: "Export preview" });
  expect(within(preview).getByText("Compositing timeline")).toBeTruthy();
  expect(within(preview).getByText("Elapsed 2:20")).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(within(preview).getByText("Elapsed 2:21")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "81",
  );
  expect(within(preview).getByText("81% rendered")).toBeTruthy();
});
it("uses one video player, switches exports and filters the list", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        json({ pending_files: 0, deleted_files: 0, freed_bytes: 0 }),
      ),
    ),
  );
  const view = mount(<RenderQueue jobs={jobs} />);
  expect(view.container.querySelectorAll("video")).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview Sea revision 2" }),
  );
  expect(view.container.querySelector("video")?.getAttribute("src")).toContain(
    "job1",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Search exports" }), {
    target: { value: "Forest" },
  });
  expect(
    screen.queryByRole("button", { name: "Preview Sea revision 2" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Preview Forest revision 1" }),
  ).toBeTruthy();
});
it("requires explicit scoped confirmation and preserves it after a failed deletion", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>((url) =>
    Promise.resolve(
      String(url).endsWith("/clear")
        ? json({ detail: "Disk request failed" }, 500)
        : json({ pending_files: 0, deleted_files: 0, freed_bytes: 0 }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  mount(<RenderQueue jobs={jobs} projectId="p" />);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select visible exports" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Scope: this project")).toBeTruthy();
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/clear"))).toBe(
    false,
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete permanently" }),
  );
  await waitFor(() => expect(within(dialog).getByRole("alert")).toBeTruthy());
  const call = fetch.mock.calls.find(([url]) =>
    String(url).endsWith("/clear"),
  )!;
  expect(JSON.parse(call[1]?.body as string)).toEqual({
    job_ids: ["job0", "job1"],
    project_id: "p",
  });
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep files" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("edits project metadata through the serialized operation mutation", async () => {
  const p = {
    ...defaults.project,
    id: "p",
    name: "Before",
    duration_ms: 0,
  } as Project;
  const onClose = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>((url) =>
    Promise.resolve(
      String(url).endsWith("/channels")
        ? json([])
        : json({ ...p, name: "After", brief: "A clear brief", revision: 2 }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  mount(
    <ProjectManager
      project={p}
      mode="edit"
      onClose={onClose}
      onDeleted={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
    target: { value: " After " },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Creative brief" }), {
    target: { value: "A clear brief" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(
    JSON.parse(
      fetch.mock.calls.find(([url]) => String(url).endsWith("/operations"))![1]
        ?.body as string,
    ),
  ).toEqual({
    type: "update_project",
    payload: { name: "After", brief: "A clear brief", channel_id: null },
    expected_revision: 1,
  });
});
