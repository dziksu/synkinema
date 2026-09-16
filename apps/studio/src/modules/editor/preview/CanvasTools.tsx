import type { CaptionBounds } from "@/api/generated/client";
import NumberField from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { tr, useLocale } from "@/lib/i18n";
import type { Clip, Profile, Track } from "@/lib/types";
import { useRef, type CSSProperties, type PointerEvent } from "react";

export type Placement = { x: number; y: number; width: number; height: number };
export const fullFrame: Placement = { x: 0.5, y: 0.5, width: 1, height: 1 };
export const placementOf = (clip: Clip): Placement =>
  clip.placement || fullFrame;
export const placementStyle = (p: Placement): CSSProperties => ({
  left: `${(p.x - p.width / 2) * 100}%`,
  top: `${(p.y - p.height / 2) * 100}%`,
  width: `${p.width * 100}%`,
  height: `${p.height * 100}%`,
});
// Apply the same temporary transform as the raster while dragging. New committed
// typography (including wrapping) arrives as one raster/bounds pair from Query.
export function captionPlacement(
  bounds: CaptionBounds,
  original: Clip,
  draft: Clip,
  profile: Pick<Profile, "width" | "height">,
): Placement {
  const scale = draft.font_size / original.font_size;
  return {
    x:
      draft.text_x +
      ((bounds.left + bounds.width / 2) / profile.width - original.text_x) *
        scale,
    y:
      draft.text_y +
      ((bounds.top + bounds.height / 2) / profile.height - original.text_y) *
        scale,
    width: (bounds.width / profile.width) * scale,
    height: (bounds.height / profile.height) * scale,
  };
}
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function movePlacement(
  p: Placement,
  dx: number,
  dy: number,
  snap = true,
): Placement {
  const guide = (v: number, size: number) => {
    const anchors = [size / 2, 0.5, 1 - size / 2];
    const closest = anchors.find((a) => Math.abs(a - v) < 0.015);
    return clamp(snap && closest !== undefined ? closest : v, 0, 1);
  };
  return { ...p, x: guide(p.x + dx, p.width), y: guide(p.y + dy, p.height) };
}
export function resizePlacement(
  p: Placement,
  dx: number,
  dy: number,
  corner: string,
  lock: boolean,
): Placement {
  const sx = corner.includes("w") ? -1 : 1,
    sy = corner.includes("n") ? -1 : 1;
  let width = clamp(p.width + dx * sx, 0.05, 2),
    height = clamp(p.height + dy * sy, 0.05, 2);
  if (lock) {
    const factor = clamp(
      Math.abs(dx / p.width) > Math.abs(dy / p.height)
        ? width / p.width
        : height / p.height,
      Math.max(0.05 / p.width, 0.05 / p.height),
      Math.min(2 / p.width, 2 / p.height),
    );
    width = p.width * factor;
    height = p.height * factor;
  }
  return {
    width,
    height,
    x: clamp(p.x + ((width - p.width) * sx) / 2, 0, 1),
    y: clamp(p.y + ((height - p.height) * sy) / 2, 0, 1),
  };
}
export const captionStyles = () =>
  [
    {
      id: "editorial",
      name: tr("Editorial"),
      detail: tr("Accent line · soft gradient"),
    },
    {
      id: "bold",
      name: tr("Bold hook"),
      detail: tr("Accent lettering · dark outline"),
    },
    {
      id: "boxed",
      name: tr("Subtitles"),
      detail: tr("White text · dark boxes"),
    },
    {
      id: "minimal",
      name: tr("Minimal"),
      detail: tr("Clean text · no background"),
    },
  ] as const;
export function CaptionStyles({
  value,
  onChange,
}: {
  value: Clip["caption_style"];
  onChange: (v: NonNullable<Clip["caption_style"]>) => void;
}) {
  useLocale();
  return (
    <div
      className="caption-styles"
      role="group"
      aria-label={tr("Caption style")}
    >
      {captionStyles().map((s) => (
        <button
          key={s.id}
          type="button"
          className={`caption-style style-${s.id}`}
          aria-pressed={(value || "editorial") === s.id}
          onClick={() => onChange(s.id)}
        >
          <strong>{s.name}</strong>
          <small>{s.detail}</small>
        </button>
      ))}
    </div>
  );
}
export function PlacementControls({
  clip,
  onChange,
}: {
  clip: Clip;
  onChange: (c: Partial<Clip>) => void;
}) {
  useLocale();
  const p = placementOf(clip);
  const presets = [
    { name: tr("Full frame"), value: fullFrame },
    {
      name: tr("Picture in picture"),
      value: { x: 0.76, y: 0.25, width: 0.38, height: 0.38 },
    },
    { name: tr("Top half"), value: { x: 0.5, y: 0.25, width: 1, height: 0.5 } },
    {
      name: tr("Bottom half"),
      value: { x: 0.5, y: 0.75, width: 1, height: 0.5 },
    },
    {
      name: tr("Left half"),
      value: { x: 0.25, y: 0.5, width: 0.5, height: 1 },
    },
    {
      name: tr("Right half"),
      value: { x: 0.75, y: 0.5, width: 0.5, height: 1 },
    },
  ];
  return (
    <>
      <h3 className="inspector-section">{tr("Canvas position & size")}</h3>
      <p className="hint">
        {tr(
          "Drag the layer on the canvas. Drag a corner to resize; hold Shift for free proportions. Alt disables snapping.",
        )}
      </p>
      <div className="layout-presets">
        {presets.map((v) => (
          <Button
            variant="outline"
            className="button"
            key={v.name}
            onClick={() => onChange({ placement: v.value })}
          >
            {v.name}
          </Button>
        ))}
      </div>
      <div className="field-grid">
        {(
          [
            ["x", tr("Center X")],
            ["y", tr("Center Y")],
            ["width", tr("Width")],
            ["height", tr("Height")],
          ] as const
        ).map(([key, label]) => (
          <NumberField
            key={key}
            label={label}
            value={Math.round(p[key] * 1000) / 10}
            suffix="%"
            min={key === "x" || key === "y" ? 0 : 5}
            max={key === "x" || key === "y" ? 100 : 200}
            step={1}
            onChange={(v) => onChange({ placement: { ...p, [key]: v / 100 } })}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        className="text-button"
        onClick={() => onChange({ placement: { ...p, x: 0.5, y: 0.5 } })}
      >
        {tr("Center on canvas")}
      </Button>
    </>
  );
}

export function CanvasTarget({
  clip,
  track,
  selected,
  frameWidth,
  frameHeight,
  textPlacement,
  onSelect,
  onDraft,
  onCommit,
}: {
  clip: Clip;
  track: Track;
  selected: boolean;
  frameWidth: number;
  frameHeight?: number;
  textPlacement?: Placement;
  onSelect: () => void;
  onDraft: (c: Partial<Clip> | null) => void;
  onCommit: (c: Partial<Clip>) => void;
}) {
  useLocale();
  const text = track.kind === "text";
  const p = textPlacement ?? placementOf(clip);
  const drag = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    p: Placement;
    corner: string;
    changes: Partial<Clip>;
    moved: boolean;
    original: Clip;
  } | null>(null);
  const begin = (e: PointerEvent<HTMLDivElement>, corner = "") => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    e.currentTarget.focus();
    const canvas = e.currentTarget
      .closest(".preview-canvas")!
      .getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      w: canvas.width,
      h: canvas.height,
      p,
      corner,
      changes: {},
      moved: false,
      original: clip,
    };
  };
  const finish = (cancel: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && !cancel) onCommit(d.changes);
    else onDraft(null);
  };
  // Keep the node (and keyboard focus) across raster requests, but never show
  // guessed/stale geometry while the new caption is loading.
  const pendingText = text && !textPlacement;
  return (
    <div
      className={`canvas-target ${selected ? "is-selected" : ""}`}
      role="button"
      tabIndex={pendingText ? -1 : 0}
      aria-busy={pendingText || undefined}
      aria-label={tr("Position {{name}} on canvas", { name: clip.name })}
      style={{
        ...placementStyle(p),
        ...(pendingText ? { opacity: 0, pointerEvents: "none" } : {}),
      }}
      onPointerDown={(e) =>
        begin(e, (e.target as HTMLElement).dataset.corner || "")
      }
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x) / d.w,
          dy = (e.clientY - d.y) / d.h;
        if (
          Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 3 &&
          !d.moved
        )
          return;
        d.moved = true;
        d.changes = text
          ? d.corner
            ? {
                font_size: Math.round(
                  clamp(
                    d.original.font_size *
                      (1 +
                        (Math.abs(dx / d.p.width) > Math.abs(dy / d.p.height)
                          ? (dx / d.p.width) * (d.corner.includes("w") ? -1 : 1)
                          : (dy / d.p.height) *
                            (d.corner.includes("n") ? -1 : 1))),
                    16,
                    200,
                  ),
                ),
              }
            : {
                text_x: clamp((d.original.text_x ?? 0.09) + dx, 0, 0.9),
                text_y: clamp(d.original.text_y + dy, 0.1, 0.85),
              }
          : {
              placement: d.corner
                ? resizePlacement(d.p, dx, dy, d.corner, !e.shiftKey)
                : movePlacement(d.p, dx, dy, !e.altKey),
            };
        onDraft(d.changes);
      }}
      onPointerUp={() => finish(false)}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => {
        if (drag.current) finish(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          finish(true);
          e.stopPropagation();
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onSelect();
          return;
        }
        const dir = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[e.key];
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        const dx = (dir[0] * (e.shiftKey ? 10 : 1)) / frameWidth,
          dy = (dir[1] * (e.shiftKey ? 10 : 1)) / (frameHeight || frameWidth);
        onCommit(
          text
            ? {
                text_x: clamp((clip.text_x ?? 0.09) + dx, 0, 0.9),
                text_y: clamp(clip.text_y + dy, 0.1, 0.85),
              }
            : { placement: movePlacement(p, dx, dy, false) },
        );
      }}
    >
      {selected && (
        <>
          <span className="canvas-target-label">{clip.name}</span>
          {["nw", "ne", "sw", "se"].map((c) => (
            <span
              key={c}
              data-corner={c}
              className={`canvas-handle handle-${c}`}
            />
          ))}
        </>
      )}
    </div>
  );
}
