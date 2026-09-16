// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import ScriptEditor from "./ScriptEditor";
import { http } from "./api/transport";
import { keys } from "./api/queries";
import defaults from "./api/generated/defaults.json";
import { newScriptLine } from "./scriptLines";
import type {
  Asset,
  ProjectSnapshot,
  VoiceStatus,
} from "./api/generated/client";
vi.mock("./api/transport", () => ({
  http: {
    api: {
      assets: vi.fn(),
      voiceStatus: vi.fn(),
      operation: vi.fn(),
      generateVoice: vi.fn(),
      upload: vi.fn(),
      removeScriptAudio: vi.fn(),
    },
  },
}));
let query: QueryClient;
let server: ProjectSnapshot;
let assets: Asset[];
const asset = (id = "take") =>
  ({
    id,
    kind: "audio",
    has_audio: true,
    duration_ms: 1500,
    name: `${id}.wav`,
    url: `/media/${id}.wav`,
    version: 1,
  }) as Asset;
const status = {
  default_provider: "supertonic",
  providers: [
    {
      id: "supertonic",
      name: "Local",
      configured: true,
      local: true,
      input_limit: 1000,
      model_id: "local",
      languages: [{ id: "en", name: "English" }],
      voices: [{ id: "F1", name: "F1" }],
    },
  ],
} as VoiceStatus;
function setup(
  lines?: ProjectSnapshot["script_lines"],
  initialAssets: Asset[] = [],
) {
  server = {
    ...structuredClone(defaults.project),
    id: "p",
    script: "First sentence.\n\nSecond sentence.",
    ...(lines
      ? { script_lines: lines, script: lines.map((l) => l.text).join("\n") }
      : {}),
  } as ProjectSnapshot;
  assets = initialAssets;
  query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  query.setQueryData(keys.project("p"), server);
  vi.mocked(http.api.assets).mockImplementation(async () => assets);
  vi.mocked(http.api.voiceStatus).mockResolvedValue(status);
  vi.mocked(http.api.operation).mockImplementation(async (_id, op) => {
    if (op.expected_revision !== server.revision)
      throw new Error("Revision conflict");
    const payload = op.payload as {
      script_lines: ProjectSnapshot["script_lines"];
      brief: string;
    };
    server = {
      ...server,
      ...payload,
      // A real server serializes fields in model order; Query may retain the
      // earlier optimistic object's key order through structural sharing.
      script_lines: payload.script_lines.map((line) => ({
        id: line.id,
        text: line.text,
        audio_asset_id: line.audio_asset_id,
        audio_text: line.audio_text,
        audio_source: line.audio_source,
      })),
      script: payload.script_lines.map((l) => l.text).join("\n"),
      revision: server.revision + 1,
    };
    return server;
  });
  function Harness() {
    const p = useQuery({
      queryKey: keys.project("p"),
      queryFn: async () => server,
    });
    return <ScriptEditor project={p.data!} onSaved={vi.fn()} />;
  }
  return render(
    <QueryClientProvider client={query}>
      <Harness />
    </QueryClientProvider>,
  );
}
async function enableVoice() {
  await screen.findByRole("option", { name: "English" });
  fireEvent.change(screen.getByLabelText("Speech language"), {
    target: { value: "en" },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
  query?.clear();
  vi.unstubAllGlobals();
});
it("migrates legacy paragraphs, splits at the cursor and preserves a dirty draft across polls", async () => {
  setup();
  await enableVoice();
  const first = screen.getByLabelText("Line 1 text") as HTMLTextAreaElement;
  fireEvent.change(first, { target: { value: "Hello world" } });
  first.setSelectionRange(6, 6);
  fireEvent.keyDown(first, { key: "Enter" });
  expect(
    (screen.getByLabelText("Line 1 text") as HTMLTextAreaElement).value,
  ).toBe("Hello ");
  expect(
    (screen.getByLabelText("Line 2 text") as HTMLTextAreaElement).value,
  ).toBe("world");
  await act(async () => {
    server = { ...server, revision: 2, script: "External change" };
    query.setQueryData(keys.project("p"), server);
  });
  expect(
    (screen.getByLabelText("Line 2 text") as HTMLTextAreaElement).value,
  ).toBe("world");
  fireEvent.click(screen.getByRole("button", { name: "Save script" }));
  await screen.findByText(
    "The script changed elsewhere. Reload the saved script before trying again.",
  );
  expect(http.api.operation).not.toHaveBeenCalled();
});
it("generates a single line, attaches only the real result and persists its text snapshot", async () => {
  setup();
  await enableVoice();
  const invalidate = vi.spyOn(query, "invalidateQueries");
  let finish!: (value: any) => void;
  vi.mocked(http.api.generateVoice).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(
    within(screen.getByRole("article", { name: "Line 2" })).getByRole(
      "button",
      { name: "Generate line" },
    ),
  );
  await waitFor(() => expect(http.api.generateVoice).toHaveBeenCalledOnce());
  expect(server.script_lines.every((line) => !line.audio_asset_id)).toBe(true);
  expect(screen.queryByLabelText("Audio for line 2")).toBeNull();
  assets = [asset()];
  await act(async () => finish({ asset: assets[0], cached: false }));
  await screen.findByLabelText("Audio for line 2");
  await waitFor(() =>
    expect(server.script_lines[1].audio_asset_id).toBe("take"),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["asset-usage"] });
  expect(server.script_lines[0].audio_asset_id).toBeNull();
  expect(server.script_lines[1].audio_text).toBe("Second sentence.");
  expect(
    vi
      .mocked(http.api.operation)
      .mock.calls.map(([, op]) => op.expected_revision),
  ).toEqual([1, 2]);
  fireEvent.change(screen.getByLabelText("Line 2 text"), {
    target: { value: "Changed" },
  });
  await screen.findByText("Text changed — review this take");
});
it("bulk generation keeps manual audio and saves completed lines when the next generation fails", async () => {
  setup([
    {
      ...newScriptLine("Manual"),
      audio_asset_id: "manual",
      audio_source: "uploaded",
      audio_text: "Manual",
    },
    newScriptLine("First AI"),
    newScriptLine("Second AI"),
  ]);
  await enableVoice();
  vi.mocked(http.api.generateVoice)
    .mockImplementationOnce(async () => {
      assets = [asset("first")];
      return { asset: assets[0], cached: false };
    })
    .mockRejectedValueOnce(new Error("Provider failed"));
  fireEvent.click(screen.getByRole("button", { name: "Generate all" }));
  await screen.findByText("Provider failed");
  expect(
    vi
      .mocked(http.api.generateVoice)
      .mock.calls.map(([request]) => request.text),
  ).toEqual(["First AI", "Second AI"]);
  expect(server.script_lines.map((line) => line.audio_asset_id)).toEqual([
    "manual",
    "first",
    null,
  ]);
});
it("rolls back a failed attachment, keeps the existing take and displays the failure", async () => {
  setup([
    {
      ...newScriptLine("Hello"),
      audio_asset_id: "old",
      audio_text: "Hello",
      audio_source: "recorded",
    },
  ]);
  await enableVoice();
  vi.mocked(http.api.generateVoice).mockResolvedValue({
    asset: asset("new"),
    cached: false,
  });
  const original = vi.mocked(http.api.operation).getMockImplementation()!;
  vi.mocked(http.api.operation)
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new Error("Revision conflict"));
  fireEvent.click(screen.getByRole("button", { name: "Generate line" }));
  await screen.findByText("Revision conflict");
  expect(
    query.getQueryData<ProjectSnapshot>(keys.project("p"))?.script_lines[0]
      .audio_asset_id,
  ).toBe("old");
  expect(server.script_lines[0].audio_asset_id).toBe("old");
});
it("uploads audio into the project and saves the line association", async () => {
  setup();
  vi.mocked(http.api.upload).mockImplementation(async () => {
    assets = [asset("upload")];
    return assets[0];
  });
  const file = new File(["audio"], "my-take.wav", { type: "audio/wav" });
  fireEvent.change(screen.getByLabelText("Upload audio for line 1"), {
    target: { files: [file] },
  });
  await screen.findByLabelText("Audio for line 1");
  await waitFor(() =>
    expect(server.script_lines[0].audio_source).toBe("uploaded"),
  );
  expect(http.api.upload).toHaveBeenCalledWith({ file, project_id: "p" });
});

it("removes a take immediately through the guarded endpoint, saves draft text and clears cached undo audio", async () => {
  setup(
    [
      {
        ...newScriptLine("Hello"),
        id: "line",
        audio_asset_id: "take",
        audio_text: "Hello",
        audio_source: "recorded",
      },
    ],
    [asset()],
  );
  await screen.findByLabelText("Audio for line 1");
  query.setQueryData([...keys.project("p"), 1], server);
  query.setQueryData([...keys.project("other"), 1], { ...server, id: "other" });
  query.setQueryData(keys.inventory, [asset()]);
  const invalidation = vi.spyOn(query, "invalidateQueries");
  vi.mocked(http.api.removeScriptAudio).mockImplementation(async () => {
    server = {
      ...server,
      revision: server.revision + 1,
      script_lines: server.script_lines.map((line) => ({
        ...line,
        audio_asset_id: null,
        audio_source: null,
        audio_text: null,
      })),
    };
    assets = [];
    return {
      project: server,
      asset_ids: ["take"],
      project_ids: [],
      job_ids: [],
      retained_asset_id: null,
      deleted_files: 1,
      freed_bytes: 123,
      pending_files: 0,
    };
  });
  fireEvent.change(screen.getByLabelText("Line 1 text"), {
    target: { value: "Keep my draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove audio" }));
  await screen.findByText("Audio and its local file were removed.");
  expect(http.api.removeScriptAudio).toHaveBeenCalledWith("p", "line", {
    expected_revision: 2,
    expected_version: 1,
    audio_asset_id: "take",
  });
  expect(server.script_lines[0].text).toBe("Keep my draft");
  expect(server.script_lines[0].audio_asset_id).toBeNull();
  expect(query.getQueryData([...keys.project("p"), 1])).toBeUndefined();
  expect(query.getQueryData([...keys.project("other"), 1])).toBeDefined();
  expect(query.getQueryData(keys.inventory)).toEqual([]);
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ["asset-usage"] });
  expect(screen.queryByLabelText("Audio for line 1")).toBeNull();
});

it("keeps the take and draft visible when removal conflicts; never retries a destructive write", async () => {
  setup(
    [
      {
        ...newScriptLine("Hello"),
        id: "line",
        audio_asset_id: "take",
        audio_text: "Hello",
        audio_source: "uploaded",
      },
    ],
    [asset()],
  );
  await screen.findByLabelText("Audio for line 1");
  vi.mocked(http.api.removeScriptAudio).mockRejectedValue(
    new Error("This audio is used on the timeline"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove audio" }));
  await screen.findByText("This audio is used on the timeline");
  expect(http.api.removeScriptAudio).toHaveBeenCalledOnce();
  expect(server.revision).toBe(1);
  expect(
    query.getQueryData<ProjectSnapshot>(keys.project("p"))?.script_lines[0]
      .audio_asset_id,
  ).toBe("take");
  expect(screen.getByLabelText("Audio for line 1")).toBeDefined();
});
