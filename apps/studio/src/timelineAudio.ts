import type { Clip } from "./types";

export function valueAt(
  clip: Clip,
  property: string,
  time: number,
  fallback: number,
) {
  const animation = clip.animations.find((a) => a.property === property);
  if (!animation) return fallback;
  const keys = animation.keyframes;
  const local = time - clip.start_ms;
  if (local <= keys[0].time_ms) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    if (local < keys[i].time_ms) {
      let u =
        (local - keys[i - 1].time_ms) / (keys[i].time_ms - keys[i - 1].time_ms);
      const easing = keys[i].easing;
      if (easing === "ease_in") u *= u;
      else if (easing === "ease_out") u = 1 - (1 - u) ** 2;
      else if (easing === "ease_in_out") u = u * u * (3 - 2 * u);
      return keys[i - 1].value + (keys[i].value - keys[i - 1].value) * u;
    }
  }
  return keys.at(-1)!.value;
}

export function audioLevel(clip: Clip, time: number, trackGain = 0) {
  const local = time - clip.start_ms;
  if (local < 0 || local >= clip.duration_ms) return 0;
  const fadeIn = clip.fade_in_ms ? Math.min(1, local / clip.fade_in_ms) : 1;
  const fadeOut = clip.fade_out_ms
    ? Math.min(1, (clip.duration_ms - local) / clip.fade_out_ms)
    : 1;
  return (
    10 ** ((valueAt(clip, "gain_db", time, clip.gain_db) + trackGain) / 20) *
    fadeIn *
    fadeOut
  );
}

export function gainAnimation(
  clip: Clip,
  points: Clip["animations"][number]["keyframes"],
) {
  return [
    ...clip.animations.filter((a) => a.property !== "gain_db"),
    ...(points.length
      ? [
          {
            property: "gain_db" as const,
            keyframes: [...points].sort((a, b) => a.time_ms - b.time_ms),
          },
        ]
      : []),
  ];
}

export function putGainPoint(clip: Clip, time: number, gain: number) {
  const time_ms = Math.max(0, Math.min(clip.duration_ms, Math.round(time)));
  const points =
    clip.animations.find((a) => a.property === "gain_db")?.keyframes || [];
  if (points.length >= 64 && !points.some((p) => p.time_ms === time_ms))
    return clip.animations;
  return gainAnimation(clip, [
    ...points.filter((p) => p.time_ms !== time_ms),
    { time_ms, value: Math.max(-60, Math.min(12, gain)), easing: "linear" },
  ]);
}

// Reuse one source per media element, including React StrictMode effect replay.
let context: AudioContext | undefined;
const nodes = new WeakMap<HTMLMediaElement, GainNode>();
export function connectAudioPreview(element: HTMLMediaElement) {
  if (typeof AudioContext === "undefined") return undefined;
  context ||= new AudioContext();
  let gain = nodes.get(element);
  if (!gain) {
    gain = context.createGain();
    context.createMediaElementSource(element).connect(gain);
    nodes.set(element, gain);
  }
  gain.connect(context.destination);
  return { context, gain };
}
