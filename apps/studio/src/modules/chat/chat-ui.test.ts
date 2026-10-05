// @vitest-environment jsdom
import type { AgentChat } from "@/api/generated/client";
import { keys } from "@/api/queries";
import { http } from "@/api/transport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConversationActions } from "./ConversationActions";
import { ConversationList } from "./ConversationList";

vi.hoisted(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const chat = (patch: Partial<AgentChat> = {}): AgentChat => ({
  id: "a",
  title: "First chat",
  provider: "codex",
  project_id: null,
  project_name: null,
  mode: "ask",
  directory: "",
  archived: false,
  running: false,
  version: 1,
  created_at: "2026-10-05",
  updated_at: "2026-10-05",
  messages: [],
  ...patch,
});
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  document.getAnimations = () => [];
  Element.prototype.getAnimations = () => [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
    })),
  );
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => document.body,
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index =
        this.closest("[data-chat-id]")?.getAttribute("data-chat-id") === "b"
          ? 1
          : 0;
      return new DOMRect(0, index * 64, 280, 60);
    },
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function view(element: ReturnType<typeof createElement>) {
  return render(createElement(QueryClientProvider, { client }, element));
}
function openMenu(title = "First chat") {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: `Conversation options for ${title}` }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
}

it("shows adjacent options without selecting a conversation and renames using its confirmed version", async () => {
  const a = chat();
  const onSelect = vi.fn();
  client.setQueryData(keys.agentChats, [a]);
  client.setQueryData(keys.agentChat(a.id), a);
  const update = vi
    .spyOn(http.api, "updateAgentChat")
    .mockResolvedValue(chat({ title: "Renamed", version: 2 }));
  view(
    createElement(ConversationList, {
      chats: [a],
      selectedId: null,
      pending: false,
      onSelect,
      onReorder: vi.fn(),
    }),
  );
  openMenu();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Rename conversation",
  });
  fireEvent.change(within(dialog).getByLabelText("Title"), {
    target: { value: "Renamed" },
  });
  fireEvent.submit(
    within(dialog).getByRole("button", { name: "Save" }).closest("form")!,
  );
  await vi.waitFor(() =>
    expect(update).toHaveBeenCalledWith("a", {
      expected_version: 1,
      title: "Renamed",
    }),
  );
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("keeps a rename draft on a version conflict until the owner reloads it", async () => {
  const update = vi
    .spyOn(http.api, "updateAgentChat")
    .mockRejectedValue(new Error("Version conflict"));
  const ui = view(createElement(ConversationActions, { chat: chat() }));
  openMenu();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
  const input = await screen.findByLabelText("Title");
  fireEvent.change(input, { target: { value: "Draft title" } });
  ui.rerender(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ConversationActions, {
        chat: chat({ title: "Server title", version: 4 }),
      }),
    ),
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Save" }).closest("form")!,
  );
  await screen.findByRole("alert");
  expect(update).toHaveBeenCalledWith("a", {
    expected_version: 1,
    title: "Draft title",
  });
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "Draft title",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload conversation" }));
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "Server title",
  );
});

it("offers restore for archived chats and waits for explicit deletion confirmation", async () => {
  const a = chat({ archived: true });
  client.setQueryData(keys.agentChats, [a]);
  const remove = vi
    .spyOn(http.api, "deleteAgentChat")
    .mockResolvedValue({ chat_id: "a", deleted: true });
  view(createElement(ConversationActions, { chat: a }));
  openMenu();
  expect(
    await screen.findByRole("menuitem", { name: "Restore conversation" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("menuitem", { name: "Delete conversation" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm delete conversation" }),
  );
  await vi.waitFor(() =>
    expect(remove).toHaveBeenCalledWith("a", { expected_version: 1 }),
  );
});

it("requires a 350 ms hold to activate dragging and cancels a short press", async () => {
  view(
    createElement(ConversationList, {
      chats: [chat(), chat({ id: "b", title: "Second chat" })],
      selectedId: "a",
      pending: false,
      onSelect: vi.fn(),
      onReorder: vi.fn(),
    }),
  );
  vi.useFakeTimers();
  const row = screen.getAllByRole("listitem")[0];
  const handle = within(row).getByRole("button", {
    name: "Open conversation First chat",
  });
  fireEvent.pointerDown(handle, {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 10,
    clientY: 10,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(349);
  });
  expect(row.getAttribute("data-dragging")).toBe("false");
  fireEvent.pointerUp(document, { pointerId: 1 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(row.getAttribute("data-dragging")).toBe("false");
  fireEvent.pointerDown(handle, {
    button: 0,
    isPrimary: true,
    pointerId: 2,
    pointerType: "mouse",
    clientX: 10,
    clientY: 10,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(32);
  });
  expect(row.getAttribute("data-dragging")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
});
