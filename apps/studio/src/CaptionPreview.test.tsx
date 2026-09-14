// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CaptionPreview, {
  captionFade,
  upcomingCaptions,
} from "./CaptionPreview";
import defaults from "./api/generated/defaults.json";
import { http } from "./api/transport";
import type { Clip, Project } from "./types";
import type { CaptionPreview as CaptionResult } from "./api/generated/client";
vi.mock("./api/transport", () => ({
  http: { api: { previewCaption: vi.fn() } },
}));
const clip = {
  ...defaults.clip,
  id: "caption",
  text: "Wodniczka",
  subtitle: "Chroń naturę",
  start_ms: 1000,
  duration_ms: 2000,
  fade_in_ms: 100,
  fade_out_ms: 200,
} as Clip;
const project = { ...defaults.project, profile: defaults.profile } as Project;
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(http.api.previewCaption).mockResolvedValue({
    url: "/media/cache/caption.png",
    width: 1080,
    height: 1920,
    bounds: { left: 90, top: 200, width: 700, height: 180 },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function wrap(child: React.ReactNode) {
  return <QueryClientProvider client={client}>{child}</QueryClientProvider>;
}
it("queries paired export raster and bounds for unsaved text and caches repeat requests", async () => {
  const view = render(
    wrap(<CaptionPreview project={project} clip={clip} opacity={0.5} />),
  );
  expect((await screen.findByRole("img")).getAttribute("src")).toBe(
    "/media/cache/caption.png",
  );
  expect(http.api.previewCaption).toHaveBeenCalledWith(
    { clip, profile: project.profile },
    { signal: expect.any(AbortSignal) },
  );
  expect(
    view.container.querySelector(".preview-caption")?.getAttribute("style"),
  ).toContain("opacity: 0.5");
  view.rerender(
    wrap(
      <CaptionPreview
        project={project}
        clip={{ ...clip, text: "Edited before save" }}
        opacity={1}
      />,
    ),
  );
  await waitFor(() => expect(http.api.previewCaption).toHaveBeenCalledTimes(2));
  view.rerender(
    wrap(<CaptionPreview project={project} clip={clip} opacity={1} />),
  );
  await screen.findByRole("img");
  expect(http.api.previewCaption).toHaveBeenCalledTimes(2);
  view.unmount();
});
it("supports retry on request failure and image decode failure", async () => {
  vi.mocked(http.api.previewCaption).mockRejectedValueOnce(
    new Error("Network error"),
  );
  render(wrap(<CaptionPreview project={project} clip={clip} opacity={1} />));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Caption preview unavailable.",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Retry caption preview" }),
  );
  fireEvent.error(await screen.findByRole("img"));
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Retry caption preview" }),
  );
  expect(await screen.findByRole("img")).toBeTruthy();
});
it("keeps the selection paired to a decoded raster through style races, size edits and undo", async () => {
  const pending: Array<(value: CaptionResult) => void> = [];
  vi.mocked(http.api.previewCaption).mockImplementation(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const result = (
    url: string,
    width: number,
    height: number,
  ): CaptionResult => ({
    url,
    width: 1080,
    height: 1920,
    bounds: { left: 100, top: 200, width, height },
  });
  const draw = (c: Clip) =>
    wrap(
      <CaptionPreview project={project} clip={c} opacity={1}>
        {(bounds) =>
          bounds ? (
            <div data-testid="bounds">
              {bounds.width}×{bounds.height}
            </div>
          ) : null
        }
      </CaptionPreview>,
    );
  const view = render(draw(clip));
  await waitFor(() => expect(pending).toHaveLength(1));
  pending[0](result("/media/cache/editorial.png", 700, 180));
  fireEvent.load(await screen.findByRole("img"));
  expect(screen.getByTestId("bounds").textContent).toBe("700×180");
  view.rerender(draw({ ...clip, caption_style: "bold" }));
  expect(screen.queryByTestId("bounds")).toBeNull();
  await waitFor(() => expect(pending).toHaveLength(2));
  view.rerender(draw({ ...clip, caption_style: "minimal", font_size: 150 }));
  await waitFor(() => expect(pending).toHaveLength(3));
  pending[2](result("/media/cache/minimal.png", 820, 340));
  const image = await screen.findByRole("img");
  expect(screen.queryByTestId("bounds")).toBeNull();
  fireEvent.load(image);
  expect(screen.getByTestId("bounds").textContent).toBe("820×340");
  pending[1](result("/media/cache/late-bold.png", 720, 120));
  await waitFor(() =>
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "/media/cache/minimal.png",
    ),
  );
  expect(screen.getByTestId("bounds").textContent).toBe("820×340");
  view.rerender(draw(clip));
  fireEvent.load(await screen.findByRole("img"));
  expect(screen.getByTestId("bounds").textContent).toBe("700×180");
  expect(http.api.previewCaption).toHaveBeenCalledTimes(3);
});
it("fades within half-open timeline boundaries", () => {
  expect(
    [999, 1000, 1050, 2000, 2900, 3000].map((t) => captionFade(clip, t)),
  ).toEqual([0, 0, 0.5, 1, 0.5, 0]);
});

it("retains the decoded caption while its moved replacement is requested and decoded", async () => {
  let resolve!: (result: CaptionResult) => void;
  const draw = (c: Clip) =>
    wrap(
      <CaptionPreview
        project={project}
        clip={c}
        opacity={1}
        imageStyle={(source) => ({
          transform: `translateY(${(c.text_y - source.text_y) * 1920}px)`,
        })}
      >
        {(bounds, source) =>
          bounds && (
            <output>
              {JSON.stringify({ top: bounds.top, y: source.text_y })}
            </output>
          )
        }
      </CaptionPreview>,
    );
  const view = render(draw(clip));
  const original = await screen.findByRole("img");
  fireEvent.load(original);
  vi.mocked(http.api.previewCaption).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  view.rerender(draw({ ...clip, text_y: 0.4 }));
  expect(original.isConnected).toBe(true);
  expect(original.style.transform).toBe(
    `translateY(${(0.4 - clip.text_y) * 1920}px)`,
  );
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({
    top: 200,
    y: clip.text_y,
  });
  await waitFor(() => expect(http.api.previewCaption).toHaveBeenCalledTimes(2));
  resolve({
    url: "/media/cache/moved.png",
    width: 1080,
    height: 1920,
    bounds: { left: 90, top: 768, width: 700, height: 180 },
  });
  await waitFor(() =>
    expect(
      view.container.querySelector('img[src="/media/cache/moved.png"]'),
    ).toBeTruthy(),
  );
  expect(original.isConnected).toBe(true);
  fireEvent.load(
    view.container.querySelector('img[src="/media/cache/moved.png"]')!,
  );
  expect(original.isConnected).toBe(false);
  expect(screen.getByRole("img").getAttribute("src")).toBe(
    "/media/cache/moved.png",
  );
  expect(screen.getByRole("img").style.transform).toBe("translateY(0px)");
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({
    top: 768,
    y: 0.4,
  });
});

it("ignores stale image load events and never carries a raster across clip identities", async () => {
  const draw = (c: Clip) =>
    wrap(<CaptionPreview project={project} clip={c} opacity={1} />);
  const view = render(draw(clip));
  fireEvent.load(await screen.findByRole("img"));
  vi.mocked(http.api.previewCaption).mockResolvedValueOnce({
    url: "/media/cache/first.png",
    width: 1080,
    height: 1920,
    bounds: null,
  });
  view.rerender(draw({ ...clip, text_y: 0.4 }));
  const first = await screen.findByRole("img");
  vi.mocked(http.api.previewCaption).mockResolvedValueOnce({
    url: "/media/cache/latest.png",
    width: 1080,
    height: 1920,
    bounds: null,
  });
  view.rerender(draw({ ...clip, text_y: 0.5 }));
  const latest = await screen.findByRole("img");
  fireEvent.load(latest);
  fireEvent.load(first);
  expect(screen.getByRole("img").getAttribute("src")).toBe(
    "/media/cache/latest.png",
  );
  vi.mocked(http.api.previewCaption).mockImplementationOnce(
    () => new Promise(() => {}),
  );
  view.rerender(draw({ ...clip, id: "other" }));
  expect(view.container.querySelector("img")).toBeNull();
});
it("preloads only the next two visible captions", () => {
  const p = {
    ...project,
    tracks: [
      {
        id: "t",
        kind: "text",
        muted: false,
        clips: [
          { ...clip, id: "last", start_ms: 9000 },
          { ...clip, id: "next", start_ms: 4000 },
          clip,
          { ...clip, id: "second", start_ms: 6000 },
        ],
      },
      { kind: "text", muted: true, clips: [{ ...clip, start_ms: 3000 }] },
    ],
  } as Project;
  expect(upcomingCaptions(p, 2000).map((c) => c.id)).toEqual([
    "next",
    "second",
  ]);
});
