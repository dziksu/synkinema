// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VoiceGenerator from "./VoiceGenerator";
import { http } from "./api/transport";
import { keys } from "./api/queries";
import type { VoiceStatus, VoiceResult } from "./api/generated/client";

vi.mock("./api/transport", () => ({
  http: { api: { voiceStatus: vi.fn(), generateVoice: vi.fn() } },
}));
const status: VoiceStatus = {
  provider: "elevenlabs",
  configured: false,
  input_limit: 5000,
  import_supported: true,
  default_provider: "supertonic",
  providers: [
    {
      id: "supertonic",
      name: "Supertonic 3",
      local: true,
      configured: true,
      input_limit: 1000,
      model_id: "supertonic-3",
      languages: [
        { id: "pl", name: "Polish" },
        { id: "en", name: "English" },
      ],
      voices: [
        { id: "F1", name: "F1" },
        { id: "M1", name: "M1" },
      ],
      reason: null,
      license_url: "https://huggingface.co/license",
      upstream_archived: true,
    },
    {
      id: "elevenlabs",
      name: "ElevenLabs",
      local: false,
      configured: true,
      input_limit: 5000,
      model_id: "eleven_multilingual_v2",
      languages: [],
      voices: [],
      reason: null,
      license_url: "https://elevenlabs.io/terms",
      upstream_archived: false,
    },
  ],
};
function setup(
  text = "Żółw błotny potrzebuje ochrony.",
  providerStatus = status,
) {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.mocked(http.api.voiceStatus).mockResolvedValue(providerStatus);
  render(
    <QueryClientProvider client={query}>
      <VoiceGenerator text={text} projectId="private-project" />
    </QueryClientProvider>,
  );
  return query;
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const result = {
  asset: { id: "actual-audio", name: "Żółw.wav", url: "/media/actual.wav" },
  cached: false,
} as VoiceResult;

it("requires an explicit supported language and imports only a confirmed private asset", async () => {
  const query = setup();
  query.setQueryData(["assets", "private-project"], []);
  query.setQueryData(keys.inventory, []);
  const invalidate = vi.spyOn(query, "invalidateQueries");
  let resolve!: (value: VoiceResult) => void;
  vi.mocked(http.api.generateVoice).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const language = await screen.findByLabelText("Speech language");
  await screen.findByRole("option", { name: "Polish" });
  const button = screen.getByRole("button", {
    name: "Generate into project media",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(screen.queryByRole("option", { name: "Automatic" })).toBeNull();
  fireEvent.change(language, { target: { value: "pl" } });
  fireEvent.change(screen.getByLabelText("Voice preset"), {
    target: { value: "M1" },
  });
  fireEvent.change(screen.getByLabelText("Speech quality"), {
    target: { value: "12" },
  });
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Generating voiceover…" });
  expect(screen.queryByLabelText("Generated voiceover")).toBeNull();
  expect(query.getQueryData(["assets", "private-project"])).toEqual([]);
  expect(http.api.generateVoice).toHaveBeenCalledWith({
    provider: "supertonic",
    language: "pl",
    voice_id: "M1",
    model_id: "supertonic-3",
    steps: 12,
    speed: 1,
    text: "Żółw błotny potrzebuje ochrony.",
    project_id: "private-project",
  });
  resolve(result);
  expect(
    (await screen.findByLabelText("Generated voiceover")).getAttribute("src"),
  ).toBe("/media/actual.wav");
  expect(query.getQueryData(["assets", "private-project"])).toEqual([
    result.asset,
  ]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["assets"] });
  expect(query.getQueryState(keys.inventory)?.isInvalidated).toBe(true);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["voice-status"] });
  expect(http.api.voiceStatus).toHaveBeenCalledWith({
    signal: expect.any(AbortSignal),
  });
});

it("surfaces generation failure and supports an explicit retry", async () => {
  setup();
  await screen.findByRole("option", { name: "Polish" });
  fireEvent.change(screen.getByLabelText("Speech language"), {
    target: { value: "pl" },
  });
  vi.mocked(http.api.generateVoice).mockRejectedValueOnce(
    new Error("Model unavailable"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Generate into project media" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Model unavailable",
  );
  expect(screen.queryByLabelText("Generated voiceover")).toBeNull();
  vi.mocked(http.api.generateVoice).mockResolvedValue(result);
  fireEvent.click(
    screen.getByRole("button", { name: "Generate into project media" }),
  );
  await screen.findByLabelText("Generated voiceover");
  expect(http.api.generateVoice).toHaveBeenCalledTimes(2);
});

it("blocks oversized local text but preserves the separate ElevenLabs contract", async () => {
  setup("x".repeat(1001));
  await screen.findByRole("option", { name: "Polish" });
  fireEvent.change(screen.getByLabelText("Speech language"), {
    target: { value: "pl" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Generate into project media",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Speech provider"), {
    target: { value: "elevenlabs" },
  });
  expect(screen.queryByLabelText("Speech language")).toBeNull();
  fireEvent.change(screen.getByLabelText("Voice ID"), {
    target: { value: "account-voice" },
  });
  vi.mocked(http.api.generateVoice).mockResolvedValue(result);
  fireEvent.click(
    screen.getByRole("button", { name: "Generate into project media" }),
  );
  await waitFor(() => expect(http.api.generateVoice).toHaveBeenCalledOnce());
  const payload = vi.mocked(http.api.generateVoice).mock.calls[0][0];
  expect(payload.provider).toBe("elevenlabs");
  expect(payload.language).toBeUndefined();
  expect(payload.steps).toBeUndefined();
});

it("disables local generation when the server has no installed model", async () => {
  setup("Test", {
    ...status,
    providers: [{ ...status.providers[0], configured: false }],
  });
  await screen.findByText(
    "Install the Supertonic SDK and pinned model on the server to enable local speech.",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Generate into project media",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(http.api.generateVoice).not.toHaveBeenCalled();
});
