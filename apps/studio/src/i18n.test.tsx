// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { i18n, tr, jobStatusLabel, trackKindLabel } from "./i18n";
import AssetCard from "./AssetCard";
import type { Asset } from "./types";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
  i18n.removeResourceBundle("de", "translation");
  vi.restoreAllMocks();
});

it("defaults to English independently of the browser locale", () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("pl-PL");
  expect(i18n.options.lng).toBe("en");
  expect(i18n.resolvedLanguage).toBe("en");
  expect(document.documentElement.lang).toBe("en");
  expect(document.documentElement.dir).toBe("ltr");
  expect(tr("New project")).toBe("New project");
});

it("supports English plurals and interpolates complete labels", () => {
  expect(tr("clipCount", { count: 0 })).toBe("0 clips");
  expect(tr("clipCount", { count: 1 })).toBe("1 clip");
  expect(tr("clipCount", { count: 5 })).toBe("5 clips");
  expect(tr("mediaCount", { count: 1 })).toBe("1 media item");
  expect(tr("Range: {{duration}} s", { duration: "2.50" })).toBe(
    "Range: 2.50 s",
  );
});

it("updates mounted controls for a future catalog and falls back to English without changing user content", async () => {
  const name = "Żubr — chroń naturę <b>";
  render(
    <AssetCard
      asset={
        {
          id: "a",
          kind: "video",
          name,
          url: "/clip.mp4",
          duration_ms: 2000,
        } as Asset
      }
      onAdd={() => {}}
      onPreview={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: `Select source range from ${name}` }),
  ).toBeTruthy();
  i18n.addResourceBundle("de", "translation", {
    "Select source range": "Quellbereich auswählen",
    "Select source range from {{name}}": "Quellbereich aus {{name}} auswählen",
    Completed: "Fertig",
  });
  await act(() => i18n.changeLanguage("de"));
  expect(
    screen.getByRole("button", { name: `Quellbereich aus ${name} auswählen` }),
  ).toBeTruthy();
  expect(screen.getByText("Quellbereich auswählen")).toBeTruthy();
  expect(document.documentElement.lang).toBe("de");
  expect(jobStatusLabel("completed")).toBe("Fertig");
  expect(trackKindLabel("voiceover")).toBe("Voiceover");
  expect(screen.getByText(name)).toBeTruthy();
  expect(document.querySelector("b")).toBeNull();
  await act(() => i18n.changeLanguage("unsupported"));
  expect(
    screen.getByRole("button", { name: `Select source range from ${name}` }),
  ).toBeTruthy();
  expect(document.documentElement.lang).toBe("en");
});
