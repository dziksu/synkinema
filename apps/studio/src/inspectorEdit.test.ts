import { describe, it, expect } from "vitest";
import { inspectorEdit } from "./inspectorEdit";
import type { Asset, Clip, Track } from "./types";
import defaults from "./api/generated/defaults.json";
const clip = {
  ...defaults.clip,
  name: "Clip",
  gain_db: 0,
  transform: {
    scale: 1,
    x: 0.5,
    y: 0.5,
    opacity: 1,
    rotation: 0,
    fit: "cover",
  },
  effects: [],
  text: "",
  subtitle: "",
  color: "#ffffff",
  font_size: 80,
  text_y: 0.66,
  id: "clip",
  asset_id: "asset",
  start_ms: 0,
  duration_ms: 8000,
  source_in_ms: 0,
  speed: 1,
  fade_in_ms: 0,
  fade_out_ms: 0,
  animations: [],
  transition: { type: "cut", duration_ms: 0 },
} as Clip;
const assets = [{ id: "asset", kind: "video", duration_ms: 8000 }] as Asset[];
const lane = (c: Clip) => ({ id: "video", kind: "video", clips: [c] }) as Track;
describe("queued inspector intent", () => {
  it("clamps duration and moves to a free gap on every non-primary track", () => {
    for (const kind of [
      "overlay",
      "text",
      "sound",
      "music",
      "voiceover",
      "ambient",
    ] as const) {
      const c = { ...clip, duration_ms: 1000 };
      const t = {
        ...lane(c),
        kind,
        clips: [c, { ...clip, id: "next", start_ms: 2000, duration_ms: 3000 }],
      };
      expect(
        inspectorEdit(t, c, { duration_ms: 4000 }, assets).payload,
      ).toMatchObject({ changes: { duration_ms: 2000 } });
      expect(
        inspectorEdit(t, c, { start_ms: 2500 }, assets).payload,
      ).toMatchObject({ start_ms: 1000 });
    }
  });
  it("shortening uses the already moved start instead of restoring the stale start", () => {
    const c = { ...clip, start_ms: 0 };
    const result = inspectorEdit(lane(c), c, { duration_ms: 3000 }, assets);
    expect(result.type).toBe("trim_clip");
    expect(result.payload).toMatchObject({
      changes: { start_ms: 0, duration_ms: 3000 },
    });
  });
  it("a zoom requested while a preceding trim saves fits the latest clip duration", () => {
    const c = { ...clip, duration_ms: 3000 };
    const result = inspectorEdit(
      lane(c),
      c,
      {
        animations: [
          {
            property: "scale",
            keyframes: [
              { time_ms: 0, value: 1, easing: "linear" },
              { time_ms: 8000, value: 1.16, easing: "ease_in_out" },
            ],
          },
        ],
      },
      assets,
      8000,
    );
    expect(result.payload).toMatchObject({
      changes: {
        animations: [{ keyframes: [{ time_ms: 0 }, { time_ms: 3000 }] }],
      },
    });
  });
  it("speed edits preserve the latest source offset and stay inside the asset", () => {
    const c = {
      ...clip,
      source_in_ms: 4000,
      duration_ms: 4000,
      start_ms: 2000,
    };
    const result = inspectorEdit(lane(c), c, { speed: 2 }, assets);
    expect(result.payload).toMatchObject({
      changes: {
        start_ms: 2000,
        source_in_ms: 4000,
        duration_ms: 2000,
        speed: 2,
      },
    });
  });
  it("rejects source offsets with no usable media instead of sending a malformed clip", () => {
    expect(() =>
      inspectorEdit(lane(clip), clip, { source_in_ms: 8000 }, assets),
    ).toThrow("0.1 s");
  });
  it("retimes existing motion and clamps fades when trimming", () => {
    const c = {
      ...clip,
      fade_out_ms: 4000,
      animations: [
        {
          property: "scale",
          keyframes: [
            { time_ms: 0, value: 1, easing: "linear" },
            { time_ms: 8000, value: 1.5, easing: "linear" },
          ],
        },
      ],
    } as Clip;
    expect(
      inspectorEdit(lane(c), c, { duration_ms: 2000 }, assets).payload,
    ).toMatchObject({
      changes: {
        fade_out_ms: 2000,
        animations: [{ keyframes: [{ time_ms: 0 }, { time_ms: 2000 }] }],
      },
    });
  });
});
