import type {
  ExportOutputOutput,
  RenderRequestInput,
} from "@/api/generated/client";
import { reads } from "@/api/queries";
import NumberField from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { tr } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, LoaderCircle, Play } from "lucide-react";
import { useForm } from "react-hook-form";

export function formatLabel(aspect: string) {
  switch (aspect) {
    case "16:9":
      return tr("Landscape video");
    case "9:16":
      return tr("Reel / Short");
    case "1:1":
      return tr("Square");
    default:
      return tr("Portrait feed");
  }
}
function qualityLabel(id: string) {
  switch (id) {
    case "high":
      return tr("High quality · recommended");
    case "maximum":
      return tr("Maximum quality · larger file");
    case "balanced":
      return tr("Balanced");
    default:
      return tr("Smaller file");
  }
}
export default function ExportSettings({
  project,
  busy,
  onExport,
}: {
  project: Project;
  busy: boolean;
  onExport: (request: RenderRequestInput) => void;
}) {
  const catalog = useQuery(reads.exportPresets());
  const form = useForm({
    defaultValues: {
      format: "project",
      edge: 1080,
      custom: { width: project.profile.width, height: project.profile.height },
      fps: project.profile.fps,
      crf: 18,
      fit: "contain" as ExportOutputOutput["fit"],
      background: "#080e10",
      x: 0.5,
      y: 0.5,
    },
  });
  const { format, edge, custom, fps, crf, fit, background, x, y } =
    form.watch();
  const setFormat = (value: typeof format) =>
    form.setValue("format", value, { shouldDirty: true });
  const setEdge = (value: typeof edge) =>
    form.setValue("edge", value, { shouldDirty: true });
  const setCustom = (value: typeof custom) =>
    form.setValue("custom", value, { shouldDirty: true });
  const setFps = (value: typeof fps) =>
    form.setValue("fps", value, { shouldDirty: true });
  const setCrf = (value: typeof crf) =>
    form.setValue("crf", value, { shouldDirty: true });
  const setFit = (value: typeof fit) =>
    form.setValue("fit", value, { shouldDirty: true });
  const setBackground = (value: typeof background) =>
    form.setValue("background", value, { shouldDirty: true });
  const setX = (value: typeof x) =>
    form.setValue("x", value, { shouldDirty: true });
  const setY = (value: typeof y) =>
    form.setValue("y", value, { shouldDirty: true });
  const presets =
    catalog.data?.presets.filter((p) => p.aspect === format) || [];
  const preset = presets.find((p) => p.id.endsWith(`-${edge}`));
  const size = format === "custom" ? custom : preset || project.profile;
  const output: ExportOutputOutput = {
    width: size.width,
    height: size.height,
    fps,
    crf,
    fit,
    background,
    x,
    y,
  };
  const request: RenderRequestInput = {
    quality: "final",
    expected_revision: project.revision,
    output,
  };
  const valid =
    output.width >= 128 &&
    output.height >= 128 &&
    output.width <= 3840 &&
    output.height <= 3840 &&
    output.width % 2 === 0 &&
    output.height % 2 === 0;
  const plan = useQuery({
    ...reads.exportPlan(project.id, request),
    enabled: valid && !busy,
  });
  const sourceAspect = project.profile.width / project.profile.height;
  const targetAspect = output.width / output.height;
  const ratioChanged = Math.abs(sourceAspect - targetAspect) > 0.01;
  const widthPercent =
    fit === "contain"
      ? Math.min(100, (sourceAspect / targetAspect) * 100)
      : Math.max(100, (sourceAspect / targetAspect) * 100);
  const heightPercent =
    fit === "contain"
      ? Math.min(100, (targetAspect / sourceAspect) * 100)
      : Math.max(100, (targetAspect / sourceAspect) * 100);
  const canExport =
    valid && !!catalog.data && !!plan.data && !plan.isError && !busy;
  return (
    <div className="export-settings">
      <p className="muted">
        {tr(
          "Export a new version in any format. Your timeline and project canvas stay unchanged.",
        )}
      </p>
      {catalog.isPending && (
        <p role="status">{tr("Loading output formats…")}</p>
      )}
      {catalog.isError && (
        <p role="alert">
          {catalog.error.message}{" "}
          <button onClick={() => void catalog.refetch()}>
            {tr("Try again")}
          </button>
        </p>
      )}
      <label className="field">
        {tr("Output format")}
        <NativeSelect
          value={format}
          onChange={(e) => {
            if (e.target.value === "custom")
              setCustom({ width: size.width, height: size.height });
            setFormat(e.target.value);
          }}
        >
          <option value="project">
            {tr("Match project canvas")} · {project.profile.width} ×{" "}
            {project.profile.height}
          </option>
          {["16:9", "9:16", "1:1", "4:5"].map((aspect) => (
            <option key={aspect} value={aspect}>
              {formatLabel(aspect)} · {aspect}
            </option>
          ))}
          <option value="custom">{tr("Custom dimensions")}</option>
        </NativeSelect>
      </label>
      {presets.length > 0 && (
        <div
          className="export-resolution-grid"
          role="group"
          aria-label={tr("Resolution")}
        >
          {presets.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={p.id === preset?.id}
              onClick={() => setEdge(Number(p.id.split("-").at(-1)))}
            >
              <strong>{p.resolution}</strong>
              <span>
                {p.width} × {p.height}
              </span>
            </button>
          ))}
        </div>
      )}
      {format === "custom" && (
        <div className="field-row">
          <NumberField
            label={tr("Width (px)")}
            value={custom.width}
            min={128}
            max={3840}
            step={2}
            onChange={(width) => setCustom({ ...custom, width })}
          />
          <NumberField
            label={tr("Height (px)")}
            value={custom.height}
            min={128}
            max={3840}
            step={2}
            onChange={(height) => setCustom({ ...custom, height })}
          />
        </div>
      )}
      {!valid && (
        <p role="alert">
          {tr("Use even dimensions between 128 and 3840 pixels.")}
        </p>
      )}
      <div className="field-row">
        <label className="field">
          {tr("Encoding quality")}
          <NativeSelect
            value={crf}
            onChange={(e) => setCrf(Number(e.target.value))}
          >
            {catalog.data?.qualities.map((q) => (
              <option key={q.id} value={q.crf}>
                {qualityLabel(q.id)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="field">
          {tr("Frame rate")}
          <NativeSelect
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
          >
            {Array.from(
              new Set([
                ...(catalog.data?.frame_rates || []),
                project.profile.fps,
              ]),
            )
              .sort((a, b) => a - b)
              .map((rate) => (
                <option key={rate} value={rate}>
                  {rate} FPS
                </option>
              ))}
          </NativeSelect>
        </label>
      </div>
      <p className="field-hint">
        {tr(
          "Higher FPS does not create new motion. Use 60 FPS when your footage supports it.",
        )}
      </p>
      {ratioChanged && (
        <div className="export-framing">
          <div>
            <label className="field">
              {tr("Frame fitting")}
              <NativeSelect
                value={fit}
                onChange={(e) => setFit(e.target.value as typeof fit)}
              >
                <option value="contain">
                  {tr("Fit · keep the whole composition")}
                </option>
                <option value="cover">
                  {tr("Fill · crop to the output frame")}
                </option>
              </NativeSelect>
            </label>
            {fit === "contain" && (
              <label className="field">
                {tr("Bar color")}
                <input
                  type="color"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              {tr("Horizontal alignment")}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
              />
            </label>
            <label className="field">
              {tr("Vertical alignment")}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
              />
            </label>
            <Button
              variant="ghost"
              type="button"
              className="button subtle"
              onClick={() => {
                setX(0.5);
                setY(0.5);
              }}
            >
              {tr("Center frame")}
            </Button>
          </div>
          <figure className="export-framing-guide">
            <div
              className="export-framing-stage"
              style={{
                aspectRatio: targetAspect,
                background,
                width: Math.min(180, 220 * targetAspect),
              }}
            >
              <div
                className="export-canvas-guide"
                style={{
                  width: `${widthPercent}%`,
                  height: `${heightPercent}%`,
                  left: `${(100 - widthPercent) * x}%`,
                  top: `${(100 - heightPercent) * y}%`,
                }}
              >
                <span>{tr("Project canvas")}</span>
              </div>
            </div>
            <figcaption>
              {tr("Framing guide · applies to all layers")}
            </figcaption>
          </figure>
        </div>
      )}
      {plan.isFetching && (
        <p role="status" className="field-hint">
          {tr("Checking source resolution…")}
        </p>
      )}
      {plan.isError && (
        <p role="alert">
          {plan.error.message}{" "}
          <button onClick={() => void plan.refetch()}>{tr("Try again")}</button>
        </p>
      )}
      {!!plan.data?.warnings.length && (
        <details className="export-warnings">
          <summary>
            {tr("{{count}} source or framing warnings", {
              count: plan.data.warnings.length,
            })}
          </summary>
          <ul>
            {plan.data.warnings.map((warning, i) => (
              <li key={`${warning.code}-${i}`}>{warning.message}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="export-delivery-summary">
        <strong>
          {output.width} × {output.height} · {fps} FPS
        </strong>
        <span>
          {tr("MP4 · H.264 · AAC")} · {project.profile.target_lufs} LUFS
        </span>
      </div>
      <div className="export-options">
        <button
          disabled={!canExport}
          onClick={form.handleSubmit(() =>
            onExport({ ...request, quality: "preview" }),
          )}
        >
          <Play />
          <strong>{tr("Check framing")}</strong>
          <span>{tr("Draft only · up to 640 px")}</span>
        </button>
        <button
          className="export-final"
          disabled={!canExport}
          onClick={form.handleSubmit(() => onExport(request))}
        >
          {busy ? <LoaderCircle className="spin" /> : <Clapperboard />}
          <strong>{tr("Export final video")}</strong>
          <span>
            {output.width} × {output.height} · {fps} FPS
          </span>
        </button>
      </div>
    </div>
  );
}
