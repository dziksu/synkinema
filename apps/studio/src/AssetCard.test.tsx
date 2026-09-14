// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import AssetCard, { sourceLink } from "./AssetCard";
import type { Asset } from "./types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("auditions a sound without adding it and leaves a separate add control", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const add = vi.fn();
  render(
    <AssetCard
      asset={
        {
          id: "sfx",
          kind: "audio",
          name: "Bong",
          url: "/bong.ogg",
          duration_ms: 123,
        } as Asset
      }
      onAdd={add}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Audition Bong" }));
  expect(play).toHaveBeenCalledOnce();
  expect(add).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "123 ms Bong" }));
  expect(add).toHaveBeenCalledOnce();
  expect(document.querySelector("button button")).toBeNull();
});
it("only one library audition plays at once", () => {
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {});
  render(
    <>
      <AssetCard
        asset={{ id: "a", kind: "audio", name: "A", url: "/a" } as Asset}
        onAdd={() => {}}
      />
      <AssetCard
        asset={{ id: "b", kind: "audio", name: "B", url: "/b" } as Asset}
        onAdd={() => {}}
      />
    </>,
  );
  const audios = document.querySelectorAll("audio");
  fireEvent.play(audios[1]);
  expect(pause).toHaveBeenCalledOnce();
  expect(pause.mock.instances[0]).toBe(audios[0]);
});

it("links to the source page without appending attribution metadata", () => {
  expect(
    sourceLink("https://kenney.nl/assets/rpg-audio | Audio/knifeSlice.ogg"),
  ).toBe("https://kenney.nl/assets/rpg-audio");
  expect(sourceLink("javascript:alert(1)")).toBeUndefined();
});
