// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { useStudio } from "./store";

let client: QueryClient | undefined;
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("imports a dropped media file through the generated upload mutation", async () => {
  const request = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      const data =
        path === "/api/state"
          ? { projects: [], jobs: [] }
          : path === "/api/assets" && init?.method === "POST"
            ? { id: "uploaded", name: "clip.mp4", kind: "video" }
            : [];
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  vi.stubGlobal("fetch", request);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  useStudio.setState({ page: "projects", projectId: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
  fireEvent.drop(container.querySelector(".app")!, {
    dataTransfer: {
      files: [file],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      types: ["Files"],
    },
  });
  await waitFor(() =>
    expect(
      request.mock.calls.some(
        ([url, init]) =>
          String(url) === "/api/assets" &&
          init?.method === "POST" &&
          init.body instanceof FormData &&
          init.body.get("file") instanceof File &&
          (init.body.get("file") as File).name === "clip.mp4",
      ),
    ).toBe(true),
  );
});
