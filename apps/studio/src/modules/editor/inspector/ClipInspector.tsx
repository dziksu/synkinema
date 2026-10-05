import NumberField from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { tr, useLocale } from "@/lib/i18n";
import { useChatDock } from "@/modules/chat/store";
import { useStudio } from "@/modules/editor/store";
import {
  CaptionStyles,
  PlacementControls,
} from "@/modules/editor/preview/CanvasTools";
import {
  Check,
  MessageSquare,
  Layers,
  Maximize2,
  SlidersHorizontal,
  Trash2,
  Type,
  Volume2,
  WandSparkles,
  ZoomIn,
} from "lucide-react";

import type { Clip, Track } from "@/lib/types";

export default function ClipInspector({
  clip: c,
  track,
  onChange,
  onRemove,
}: {
  clip: Clip;
  track: Track;
  onChange: (v: Partial<Clip>) => void;
  onRemove: () => void;
}) {
  useLocale();
  const projectId = useStudio((state) => state.projectId);
  const visual = ["video", "overlay"].includes(track.kind);
  const effectValue = (type: string) =>
    c.effects.find((e) => e.type === type && e.enabled)?.value ??
    (type === "contrast" || type === "saturation" ? 1 : 0);
  const effect = (type: Clip["effects"][number]["type"], value: number) =>
    onChange({
      effects: [
        ...c.effects.filter((e) => e.type !== type),
        { type, value, enabled: true },
      ],
    });
  return (
    <div className="inspector-body">
      <div className="clip-type">
        <span className={`clip-color ${track.kind}`} />
        {track.name}
        <span>{c.id.slice(0, 6)}</span>
      </div>
      {projectId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            useChatDock
              .getState()
              .ask(projectId, { type: "clip", target_id: c.id, label: c.name })
          }
        >
          <MessageSquare />
          {tr("Ask agent about this clip")}
        </Button>
      )}
      <label className="field">
        {" "}
        {tr("Name")}{" "}
        <Input
          defaultValue={c.name}
          onBlur={(e) =>
            e.target.value !== c.name && onChange({ name: e.target.value })
          }
        />
      </label>
      <div className="field-grid">
        <NumberField
          label={tr("Start")}
          value={c.start_ms / 1000}
          min={0}
          step={0.1}
          suffix="s"
          onChange={(v) => onChange({ start_ms: Math.round(v * 1000) })}
        />
        <NumberField
          label={tr("Duration")}
          value={c.duration_ms / 1000}
          min={0.1}
          step={0.1}
          suffix="s"
          onChange={(v) => onChange({ duration_ms: Math.round(v * 1000) })}
        />
      </div>
      {visual && <PlacementControls clip={c} onChange={onChange} />}
      {track.kind === "text" ? (
        <>
          <h3 className="inspector-section">
            <Type size={15} /> {tr("Text")}{" "}
          </h3>
          <CaptionStyles
            value={c.caption_style}
            onChange={(caption_style) => onChange({ caption_style })}
          />
          <Button
            variant="outline"
            aria-pressed={c.text_auto_center ?? false}
            onClick={() => onChange({ text_auto_center: !c.text_auto_center })}
          >
            {tr("Auto-center horizontally")}
            {c.text_auto_center && <Check size={15} />}
          </Button>
          <p className="hint">
            {tr(
              "Keeps every caption line centered on the screen. Vertical position stays adjustable. Turn off to position text manually.",
            )}
          </p>
          {!c.text_auto_center && (
            <>
              <NumberField
                label={tr("X position")}
                value={c.text_x ?? 0.09}
                min={0}
                max={0.9}
                step={0.01}
                onChange={(text_x) => onChange({ text_x })}
              />
              <label className="field">
                {tr("Text alignment")}
                <NativeSelect
                  value={c.text_align ?? "auto"}
                  onChange={(e) =>
                    onChange({
                      text_align: e.target.value as Clip["text_align"],
                    })
                  }
                >
                  <option value="auto">{tr("Style default")}</option>
                  <option value="left">{tr("Align left")}</option>
                  <option value="center">{tr("Align center")}</option>
                  <option value="right">{tr("Align right")}</option>
                </NativeSelect>
              </label>
            </>
          )}
          <label className="field">
            {" "}
            {tr("Heading")}{" "}
            <Textarea
              defaultValue={c.text}
              rows={3}
              onBlur={(e) =>
                e.target.value !== c.text && onChange({ text: e.target.value })
              }
            />
          </label>
          <label className="field">
            {" "}
            {tr("Subtitle")}{" "}
            <Textarea
              defaultValue={c.subtitle}
              rows={2}
              onBlur={(e) =>
                e.target.value !== c.subtitle &&
                onChange({ subtitle: e.target.value })
              }
            />
          </label>
          <div className="field-grid">
            <NumberField
              label={tr("Size")}
              value={c.font_size}
              min={16}
              max={200}
              onChange={(v) => onChange({ font_size: v })}
            />
            <NumberField
              label={tr("Y position")}
              value={c.text_y}
              min={0.1}
              max={0.85}
              step={0.01}
              onChange={(v) => onChange({ text_y: v })}
            />
          </div>
          <label className="field">
            {" "}
            {tr("Accent color")}{" "}
            <input
              type="color"
              defaultValue={c.color}
              onBlur={(e) => onChange({ color: e.target.value })}
            />
          </label>
        </>
      ) : c.shape ? (
        <>
          <label className="field">
            {tr("Shape color")}
            <input
              type="color"
              defaultValue={c.color}
              onBlur={(e) => onChange({ color: e.target.value })}
            />
          </label>
          <NumberField
            label={tr("Rotation")}
            value={c.transform.rotation}
            min={-180}
            max={180}
            onChange={(rotation) =>
              onChange({ transform: { ...c.transform, rotation } })
            }
          />
        </>
      ) : visual ? (
        <>
          <p className="hint">
            {" "}
            {tr(
              "Video tracks play without sound. Drag this clip onto an audio track or choose “Extract video audio” to edit its sound separately.",
            )}{" "}
          </p>
          <h3 className="inspector-section">
            <Maximize2 size={15} /> {tr("Transform")}{" "}
          </h3>
          <div className="field-grid">
            <NumberField
              label={tr("Scale")}
              value={c.transform.scale}
              min={1}
              max={4}
              step={0.05}
              suffix="×"
              onChange={(v) =>
                onChange({ transform: { ...c.transform, scale: v } })
              }
            />
            <NumberField
              label={tr("Rotation")}
              value={c.transform.rotation}
              min={-180}
              max={180}
              suffix="°"
              onChange={(v) =>
                onChange({ transform: { ...c.transform, rotation: v } })
              }
            />
            <NumberField
              label={tr("Crop anchor X")}
              value={c.transform.x}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) =>
                onChange({ transform: { ...c.transform, x: v } })
              }
            />
            <NumberField
              label={tr("Crop anchor Y")}
              value={c.transform.y}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) =>
                onChange({ transform: { ...c.transform, y: v } })
              }
            />
          </div>
          <label className="field">
            {" "}
            {tr("Fit")}{" "}
            <NativeSelect
              value={c.transform.fit}
              onChange={(e) =>
                onChange({
                  transform: {
                    ...c.transform,
                    fit: e.target.value as "cover" | "contain",
                  },
                })
              }
            >
              <option value="cover">{tr("Fill frame")}</option>
              <option value="contain">{tr("Fit in frame")}</option>
            </NativeSelect>
          </label>
          <h3 className="inspector-section">
            <WandSparkles size={15} /> {tr("Motion")}{" "}
          </h3>
          <Button
            variant="outline"
            className={`button wide ${c.animations.some((a) => a.property === "scale") ? "selected" : ""}`}
            aria-pressed={c.animations.some((a) => a.property === "scale")}
            title={tr("Toggle animated zoom from the current scale")}
            onClick={() =>
              onChange({
                animations: c.animations.some((a) => a.property === "scale")
                  ? c.animations.filter((a) => a.property !== "scale")
                  : [
                      ...c.animations,
                      {
                        property: "scale",
                        keyframes: [
                          {
                            time_ms: 0,
                            value: c.transform.scale,
                            easing: "linear",
                          },
                          {
                            time_ms: c.duration_ms,
                            value: Math.min(4, c.transform.scale * 1.16),
                            easing: "ease_in_out",
                          },
                        ],
                      },
                    ],
              })
            }
          >
            <ZoomIn size={15} /> {tr("Smooth zoom")}{" "}
            {c.animations.some((a) => a.property === "scale") && (
              <Check size={15} />
            )}
          </Button>
          {!!c.animations.length && (
            <Button
              variant="ghost"
              className="text-button"
              onClick={() => onChange({ animations: [] })}
            >
              {" "}
              {tr("Remove all animations")}{" "}
            </Button>
          )}
          <h3 className="inspector-section">
            <SlidersHorizontal size={15} /> {tr("Video effects")}{" "}
          </h3>
          <div className="field-grid">
            <NumberField
              label={tr("Blur")}
              value={effectValue("blur")}
              min={0}
              max={30}
              onChange={(v) => effect("blur", v)}
            />
            <NumberField
              label={tr("Contrast")}
              value={effectValue("contrast")}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => effect("contrast", v)}
            />
            <NumberField
              label={tr("Saturation")}
              value={effectValue("saturation")}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => effect("saturation", v)}
            />
            <NumberField
              label={tr("Brightness")}
              value={effectValue("brightness")}
              min={-1}
              max={1}
              step={0.05}
              onChange={(v) => effect("brightness", v)}
            />
          </div>
          <div className="field-grid">
            <NumberField
              label={tr("Black and white")}
              value={effectValue("grayscale")}
              min={0}
              max={1}
              step={0.1}
              onChange={(v) => effect("grayscale", v)}
            />
            <NumberField
              label={tr("Vignette")}
              value={effectValue("vignette")}
              min={0}
              max={1}
              step={0.1}
              onChange={(v) => effect("vignette", v)}
            />
            <NumberField
              label={tr("Sharpen")}
              value={effectValue("sharpen")}
              min={0}
              max={3}
              step={0.1}
              onChange={(v) => effect("sharpen", v)}
            />
          </div>
          <h3 className="inspector-section">
            <Layers size={15} /> {tr("Clip entrance")}{" "}
          </h3>
          <label className="field">
            {" "}
            {tr("Transition")}{" "}
            <NativeSelect
              value={c.transition.type}
              onChange={(e) =>
                onChange({
                  transition: {
                    type: e.target.value as Clip["transition"]["type"],
                    duration_ms: c.transition.duration_ms || 300,
                  },
                })
              }
            >
              {[
                ["cut", tr("Cut")],
                ["crossfade", tr("Dissolve")],
                ["fade_black", tr("Fade through black")],
                ["slide", tr("Slide")],
                ["wipe", tr("Wipe")],
                ["zoom", tr("Zoom")],
                ["blur", tr("Blur")],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </label>
          {c.transition.type !== "cut" && (
            <>
              <NumberField
                label={tr("Transition duration")}
                value={c.transition.duration_ms}
                min={50}
                max={2000}
                step={50}
                suffix="ms"
                onChange={(v) =>
                  onChange({ transition: { ...c.transition, duration_ms: v } })
                }
              />
              <p className="hint">
                {" "}
                {tr(
                  "Following clips, captions and audio shift together. The transition automatically connects this clip to the previous one.",
                )}{" "}
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <h3 className="inspector-section">
            <Volume2 size={15} /> {tr("Audio level")}{" "}
          </h3>
          <NumberField
            label={tr("Gain")}
            value={c.gain_db}
            min={-60}
            max={12}
            suffix="dB"
            onChange={(v) => onChange({ gain_db: v })}
          />
          <div className="gain-meter">
            <span style={{ width: `${((c.gain_db + 60) / 72) * 100}%` }} />
          </div>
        </>
      )}
      {track.kind !== "text" && !c.shape && (
        <div className="field-grid">
          <NumberField
            label={tr("Speed")}
            value={c.speed}
            min={0.25}
            max={4}
            step={0.05}
            suffix="×"
            onChange={(v) => onChange({ speed: v })}
          />
          <NumberField
            label={tr("Source start")}
            value={c.source_in_ms / 1000}
            min={0}
            step={0.1}
            suffix="s"
            onChange={(v) => onChange({ source_in_ms: Math.round(v * 1000) })}
          />
        </div>
      )}
      <div className="field-grid">
        <NumberField
          label={tr("Fade in")}
          value={c.fade_in_ms}
          min={0}
          max={c.duration_ms}
          step={1}
          suffix="ms"
          onChange={(v) => onChange({ fade_in_ms: v })}
        />
        <NumberField
          label={tr("Fade out")}
          value={c.fade_out_ms}
          min={0}
          max={c.duration_ms}
          step={1}
          suffix="ms"
          onChange={(v) => onChange({ fade_out_ms: v })}
        />
      </div>
      {(visual || track.kind === "text") && (
        <NumberField
          label={tr("Opacity")}
          value={c.transform.opacity * 100}
          min={0}
          max={100}
          suffix="%"
          onChange={(opacity) =>
            onChange({ transform: { ...c.transform, opacity: opacity / 100 } })
          }
        />
      )}
      <Button
        variant="destructive"
        className="button danger wide"
        onClick={onRemove}
      >
        <Trash2 size={15} /> {tr("Delete clip")}{" "}
      </Button>
    </div>
  );
}
