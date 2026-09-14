// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AgentConnectionGuide from "./AgentConnectionGuide";

afterEach(() => {
  cleanup();
});

it("switches client formats and copies the selected configuration", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const onNotice = vi.fn();
  render(<AgentConnectionGuide onNotice={onNotice} />);

  fireEvent.click(
    screen.getByRole("button", { name: "GitHub Copilot · VS Code" }),
  );
  expect(
    screen
      .getByRole("button", { name: "GitHub Copilot · VS Code" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.change(screen.getByLabelText("MCP address"), {
    target: { value: "http://127.0.0.1:8081/mcp/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Copy configuration" }));

  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({
    servers: {
      synkinema: { type: "http", url: "http://127.0.0.1:8081/mcp/" },
    },
  });
  expect(onNotice).toHaveBeenCalledWith("Agent configuration copied");

  fireEvent.click(
    screen.getByRole("button", { name: "Copy agent instructions" }),
  );
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  expect(writeText.mock.calls[1][0]).toContain("http://127.0.0.1:8081/mcp/");
});

it("blocks invalid addresses and provides an honest read-only check", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<AgentConnectionGuide onNotice={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("MCP address"), {
    target: { value: "http://localhost:8080/api" },
  });
  expect(screen.getByRole("alert").textContent).toContain("ending in /mcp/");
  expect(
    (
      screen.getByRole("button", {
        name: "Copy configuration",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);

  fireEvent.click(
    screen.getByRole("button", { name: "Copy connection check" }),
  );
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(writeText.mock.calls[0][0]).toContain("list_projects");
  expect(writeText.mock.calls[0][0]).toContain(
    "Do not create, edit, render or delete",
  );
});
