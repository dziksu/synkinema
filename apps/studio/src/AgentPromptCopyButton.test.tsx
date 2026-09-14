// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AgentPromptCopyButton from "./AgentPromptCopyButton";

it("copies the supplied scoped prompt and announces success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const onNotice = vi.fn();

  render(
    <AgentPromptCopyButton prompt="project project-1" onNotice={onNotice} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy agent prompt" }));

  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith("project project-1"),
  );
  expect(onNotice).toHaveBeenCalledWith("Agent prompt copied");
});
