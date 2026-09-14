import { describe, it, expect } from "vitest";
import {
  acceptsAsset,
  acceptsClip,
  freeStart,
  snapTime,
  trimValues,
  retimeAnimations,
} from "./timelineMath";
import type { Asset, Clip, Track } from "./types";
const clip = (v: Partial<Clip> = {}) =>
  ({
    id: "a",
    start_ms: 2000,
    duration_ms: 4000,
    source_in_ms: 1000,
    speed: 1,
    animations: [],
    ...v,
  }) as Clip;
const track = (kind: Track["kind"] = "video", clips: Clip[] = []) =>
  ({ id: kind, kind, clips }) as Track;
const video = { kind: "video", duration_ms: 10000, has_audio: true } as Asset;
describe("manual timeline constraints", () => {
  it("snaps within tolerance and Alt disables only magnetism", () => {
    expect(snapTime(994, [1000], 50, 30)).toEqual({ value: 1000, snap: 1000 });
    expect(snapTime(1050, [1000], 100, 30, false).snap).toBeNull();
    expect(snapTime(1500, [1000], 50, 30).value).toBe(1500);
  });
  it("finds the closest vacant slot on every track type", () => {
    const lane = track("video", [clip({ start_ms: 0 })]);
    expect(freeStart(lane, 2000, 1000)).toBe(4000);
    expect(freeStart(lane, 2000, 1000, "a")).toBe(2000);
    for (const kind of [
      "text",
      "overlay",
      "sound",
      "music",
      "voiceover",
      "ambient",
    ] as const)
      expect(freeStart(track(kind, lane.clips), 2000, 1000)).toBe(4000);
  });
  it("restricts assets and moves to compatible media lanes", () => {
    expect(acceptsAsset(track("music"), video)).toBe(true);
    expect(acceptsAsset(track("text"), video)).toBe(false);
    expect(acceptsAsset(track("video"), { kind: "audio" } as Asset)).toBe(
      false,
    );
    expect(acceptsClip(track("text"), track("video"), video)).toBe(false);
    expect(acceptsClip(track("overlay"), track("video"), video)).toBe(true);
  });
  it("left trim preserves source content and playback speed", () => {
    expect(trimValues(clip({ speed: 2 }), "left", 3000, video)).toEqual({
      start_ms: 3000,
      duration_ms: 3000,
      source_in_ms: 3000,
    });
    expect(trimValues(clip({ speed: 2 }), "left", 0, video).start_ms).toBe(
      1500,
    );
  });
  it("right trim cannot exceed source, next clip, or minimum duration", () => {
    expect(
      trimValues(clip({ speed: 2 }), "right", 20000, video).duration_ms,
    ).toBe(4500);
    expect(
      trimValues(clip(), "right", 20000, video, [
        clip({ id: "next", start_ms: 6500 }),
      ]).duration_ms,
    ).toBe(4500);
    expect(trimValues(clip(), "right", 0, video).duration_ms).toBe(100);
  });
  it("images can extend while respecting previous clip", () => {
    const image = { kind: "image" } as Asset;
    expect(
      trimValues(clip(), "left", 0, image, [
        clip({ id: "prev", start_ms: 0, duration_ms: 1500 }),
      ]).start_ms,
    ).toBe(1500);
    expect(trimValues(clip(), "right", 20000, image).duration_ms).toBe(18000);
  });
  it("retimes keyframes and removes duplicate times on very short trims", () => {
    const c = clip({
      animations: [
        {
          property: "scale",
          keyframes: [
            { time_ms: 0, value: 1, easing: "linear" },
            { time_ms: 1, value: 1, easing: "linear" },
            { time_ms: 4000, value: 1.2, easing: "linear" },
          ],
        },
      ],
    });
    expect(retimeAnimations(c, 100)[0].keyframes.map((k) => k.time_ms)).toEqual(
      [0, 100],
    );
  });
});
it("tail trim leaves room for the incoming transition", () => {
  expect(
    trimValues(
      clip({ transition: { type: "crossfade", duration_ms: 300 } }),
      "right",
      2000,
      video,
    ).duration_ms,
  ).toBe(301);
});

it("rejects sources shorter than minimum timeline duration", () => {
  expect(
    acceptsAsset(track("sound"), { kind: "audio", duration_ms: 20 } as Asset),
  ).toBe(false);
});
