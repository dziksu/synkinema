// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  EditorTop,
  SidebarToggle,
  useSidebarCollapsed,
  clampMediaWidth,
} from "./EditorLayout";

let available = 1400;
let measure: () => void;
beforeEach(() => {
  localStorage.clear();
  available = 1400;
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: available }) as DOMRect,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Sidebar() {
  const { collapsed, toggle } = useSidebarCollapsed();
  return <SidebarToggle collapsed={collapsed} onToggle={toggle} />;
}
function Layout({ sourceOpen = false }: { sourceOpen?: boolean }) {
  return (
    <EditorTop sourceOpen={sourceOpen}>
      <section>Media</section>
      <section>Preview</section>
      <aside>Inspector</aside>
    </EditorTop>
  );
}
it("collapses and expands the sidebar with an accessible persistent toggle", () => {
  const view = render(<Sidebar />);
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(
    screen
      .getByRole("button", { name: "Expand sidebar" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  view.unmount();
  render(<Sidebar />);
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(localStorage.getItem("synkinema.sidebarCollapsed")).toBe("false");
});
it("resizes on drag, persists only on release and restores the width on remount", () => {
  const view = render(<Layout />);
  const handle = screen.getByRole("separator");
  fireEvent.pointerDown(handle, { button: 0, clientX: 280 });
  fireEvent.pointerMove(handle, { clientX: 520 });
  expect(handle.getAttribute("aria-valuenow")).toBe("520");
  expect(localStorage.getItem("synkinema.mediaPanelWidth")).toBeNull();
  fireEvent.pointerUp(handle, { clientX: 520 });
  view.unmount();
  render(<Layout />);
  expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe(
    "520",
  );
});
it("supports keyboard sizing, reset and cancellation without overwriting the saved width", () => {
  render(<Layout />);
  const handle = screen.getByRole("separator");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(handle.getAttribute("aria-valuenow")).toBe("304");
  fireEvent.pointerDown(handle, { button: 0, clientX: 304 });
  fireEvent.pointerMove(handle, { clientX: 600 });
  fireEvent.keyDown(handle, { key: "Escape" });
  fireEvent.pointerUp(handle, { clientX: 600 });
  expect(handle.getAttribute("aria-valuenow")).toBe("304");
  fireEvent.keyDown(handle, { key: "End" });
  expect(handle.getAttribute("aria-valuenow")).toBe("640");
  fireEvent.doubleClick(handle);
  expect(handle.getAttribute("aria-valuenow")).toBe("280");
});
it("bounds width on container resize and preserves the preferred width for larger windows", async () => {
  const { act } = await import("@testing-library/react");
  localStorage.setItem("synkinema.mediaPanelWidth", "600");
  const view = render(<Layout />);
  act(() => {
    available = 1000;
    measure();
  });
  expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe(
    "440",
  );
  expect(localStorage.getItem("synkinema.mediaPanelWidth")).toBe("600");
  act(() => {
    available = 1500;
    measure();
  });
  expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe(
    "600",
  );
  view.rerender(<Layout sourceOpen />);
  expect(screen.queryByRole("separator")).toBeNull();
  expect(clampMediaWidth(640, 600)).toBe(200);
});
it("falls back safely when preferences are invalid or storage is unavailable", () => {
  localStorage.setItem("synkinema.mediaPanelWidth", '"bad"');
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  render(<Layout />);
  const handle = screen.getByRole("separator");
  expect(handle.getAttribute("aria-valuenow")).toBe("280");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(handle.getAttribute("aria-valuenow")).toBe("304");
});
