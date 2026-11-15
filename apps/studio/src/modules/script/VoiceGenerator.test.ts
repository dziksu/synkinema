// @vitest-environment jsdom
import type { VoiceStatus } from "@/api/generated/client";
import { keys } from "@/api/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import VoiceGenerator from "./VoiceGenerator";

afterEach(cleanup);

it("requires a reference selection and submits Turbo's English voice settings", () => {
  const text = "A little help [chuckle].";
  const client = new QueryClient();
  client.setQueryData<VoiceStatus>(keys.voiceStatus, {
    provider: "elevenlabs",
    configured: false,
    default_provider: "supertonic",
    input_limit: 5000,
    import_supported: true,
    providers: [
      {
        id: "chatterbox",
        name: "Chatterbox Turbo",
        local: true,
        configured: true,
        input_limit: 500,
        model_id: "chatterbox-turbo",
        languages: [{ id: "en", name: "English" }],
        voices: [
          { id: "one", name: "Voice One" },
          { id: "whyzy", name: "Whyzy" },
        ],
        reason: null,
        license_url: "https://example.com/license",
        upstream_archived: true,
      },
    ],
  });
  const submit = vi.fn();
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(VoiceGenerator, {
        text,
        projectId: "project",
        children: ({ request, canGenerate }) =>
          createElement(
            "button",
            {
              disabled: !canGenerate(text),
              onClick: () => submit(request(text)),
            },
            "Generate",
          ),
      }),
    ),
  );
  fireEvent.change(screen.getByLabelText("Speech provider"), {
    target: { value: "chatterbox" },
  });
  const button = screen.getByRole<HTMLButtonElement>("button", {
    name: "Generate",
  });
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Reference voice"), {
    target: { value: "whyzy" },
  });
  expect(screen.queryByLabelText("Speech speed")).toBeNull();
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(submit).toHaveBeenCalledWith({
    provider: "chatterbox",
    voice_id: "whyzy",
    model_id: "chatterbox-turbo",
    language: "en",
    speed: 1,
    project_id: "project",
    text,
  });
});
