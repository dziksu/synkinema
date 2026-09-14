// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExportSettings from "./ExportSettings";
import defaults from "./api/generated/defaults.json";
import { reads, keys } from "./api/queries";
import { writes } from "./api/mutations";
import type { Project, Job } from "./types";

const clients: QueryClient[] = [];
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const project = () =>
  structuredClone({ ...defaults.project, id: "p", revision: 8 }) as Project;
const catalog = {
  presets: [
    {
      id: "video-1080",
      aspect: "16:9",
      resolution: "Full HD · 1080p",
      width: 1920,
      height: 1080,
      kind: "video",
      name: "Landscape",
    },
    {
      id: "video-2160",
      aspect: "16:9",
      resolution: "4K UHD · 2160p",
      width: 3840,
      height: 2160,
      kind: "video",
      name: "Landscape",
    },
  ],
  qualities: [
    { id: "high", name: "High", crf: 18 },
    { id: "compact", name: "Smaller", crf: 23 },
  ],
  frame_rates: [24, 30, 60],
};
function client() {
  const c = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(c);
  return c;
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.unstubAllGlobals();
});
it("exports chosen 4K/FPS/framing without editing the project; clearly distinguishes draft", async () => {
  const p = project(),
    before = structuredClone(p),
    c = client(),
    onExport = vi.fn();
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, init) =>
      String(url).includes("export-presets")
        ? json(catalog)
        : json({
            project_id: p.id,
            revision: p.revision,
            output: JSON.parse(String(init?.body)).output,
            warnings: [],
          }),
    );
  vi.stubGlobal("fetch", transport);
  render(
    <QueryClientProvider client={c}>
      <ExportSettings project={p} busy={false} onExport={onExport} />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: /Export final video/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("Output format"), {
    target: { value: "16:9" },
  });
  fireEvent.click(screen.getByRole("button", { name: /4K UHD/ }));
  fireEvent.change(screen.getByLabelText("Frame rate"), {
    target: { value: "60" },
  });
  fireEvent.change(screen.getByLabelText("Frame fitting"), {
    target: { value: "cover" },
  });
  fireEvent.change(screen.getByLabelText("Horizontal alignment"), {
    target: { value: "0.2" },
  });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: /Export final video/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: /Export final video/ }));
  expect(onExport).toHaveBeenLastCalledWith(
    expect.objectContaining({
      quality: "final",
      expected_revision: 8,
      output: expect.objectContaining({
        width: 3840,
        height: 2160,
        fps: 60,
        crf: 18,
        fit: "cover",
        x: 0.2,
      }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Check framing/ }));
  expect(onExport.mock.lastCall?.[0].quality).toBe("preview");
  expect(screen.getByText("Draft only · up to 640 px")).toBeTruthy();
  expect(p).toEqual(before);
  expect(
    transport.mock.calls.every(([url]) =>
      /export-presets|export-plan/.test(String(url)),
    ),
  ).toBe(true);
});
it("blocks odd custom dimensions and does not enqueue while editor writes are pending", async () => {
  const c = client(),
    p = project();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (url) =>
        String(url).includes("presets")
          ? json(catalog)
          : json({ warnings: [] }),
      ),
  );
  const view = render(
    <QueryClientProvider client={c}>
      <ExportSettings project={p} busy={false} onExport={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByRole("option", { name: /High quality/ });
  fireEvent.change(screen.getByLabelText("Output format"), {
    target: { value: "custom" },
  });
  const width = screen.getByLabelText("Width (px)");
  fireEvent.change(width, { target: { value: "1921" } });
  fireEvent.blur(width);
  expect(screen.getByRole("alert").textContent).toMatch(/even dimensions/);
  expect(
    (
      screen.getByRole("button", {
        name: /Export final video/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  view.rerender(
    <QueryClientProvider client={c}>
      <ExportSettings project={p} busy onExport={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(
    (screen.getByRole("button", { name: /Check framing/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("keys plans by every export parameter and revision, deduplicates and forwards cancellation", async () => {
  const c = client();
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json({ warnings: [] }));
  vi.stubGlobal("fetch", transport);
  const body = { expected_revision: 8, output: { width: 1920, height: 1080 } };
  await Promise.all([
    c.fetchQuery(reads.exportPlan("p", body)),
    c.fetchQuery(reads.exportPlan("p", body)),
  ]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  for (const request of [
    { ...body, expected_revision: 9 },
    { ...body, output: { ...body.output, crf: 15 } },
    { ...body, output: { ...body.output, fit: "cover" as const } },
  ]) {
    transport.mockResolvedValueOnce(json({ warnings: [] }));
    await c.fetchQuery(reads.exportPlan("p", request));
  }
  expect(transport).toHaveBeenCalledTimes(4);
});
it("rolls back failed export submission and retains independent queue results", async () => {
  const c = client(),
    p = project();
  const previous = { id: "old", status: "completed" } as Job;
  c.setQueryData(keys.jobs, [previous]);
  c.setQueryData(keys.project(p.id), p);
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const mutation = c.getMutationCache().build(c, writes.render(c));
  const promise = mutation.execute({
    project: p,
    request: { expected_revision: 8, output: { width: 3840, height: 2160 } },
  });
  await waitFor(() => expect(c.getQueryData<Job[]>(keys.jobs)?.length).toBe(2));
  const pending = c.getQueryData<Job[]>(keys.jobs)![0];
  expect(pending.output_url).toBeNull();
  expect(pending.request.output?.width).toBe(3840);
  resolve(json({ detail: "Project changed" }, 409));
  await expect(promise).rejects.toMatchObject({ status: 409 });
  expect(c.getQueryData(keys.jobs)).toEqual([previous]);
  expect(c.getQueryData(keys.project(p.id))).toEqual(p);
});
