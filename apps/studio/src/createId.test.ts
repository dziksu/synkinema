import { it, expect, vi } from "vitest";
import { createId } from "./createId";
it("creates unique IDs on LAN HTTP without crypto.randomUUID", () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal("crypto", { getRandomValues });
  try {
    const a = createId(),
      b = createId();
    expect(a).toMatch(/^[a-f0-9]{32}$/);
    expect(a).not.toBe(b);
  } finally {
    vi.unstubAllGlobals();
  }
});
