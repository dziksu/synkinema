// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NumberField from "./NumberField";
afterEach(cleanup);
it("shows the resolved duration when a collision clamps an edit to the unchanged value", () => {
  const change = vi.fn();
  const { rerender } = render(
    <NumberField label="Duration" value={4} onChange={change} />,
  );
  const input = screen.getByRole("spinbutton") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "6" } });
  fireEvent.blur(input);
  expect(change).toHaveBeenCalledWith(6);
  rerender(<NumberField label="Duration" value={4} onChange={change} />);
  expect(input.value).toBe("4");
});
it("preserves an active draft while another edit reconciles", () => {
  const change = vi.fn();
  const { rerender } = render(
    <NumberField label="Duration" value={4} onChange={change} />,
  );
  const input = screen.getByRole("spinbutton") as HTMLInputElement;
  input.focus();
  fireEvent.change(input, { target: { value: "6" } });
  rerender(<NumberField label="Duration" value={5} onChange={change} />);
  expect(input.value).toBe("6");
  input.blur();
  expect(change).toHaveBeenCalledWith(6);
});
