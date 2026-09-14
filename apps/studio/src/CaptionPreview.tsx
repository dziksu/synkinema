import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { reads } from "./api/queries";
import { tr, useLocale } from "./i18n";
import type { Clip, Project } from "./types";
import type {
  CaptionBounds,
  CaptionPreview as CaptionRaster,
} from "./api/generated/client";

type DecodedCaption = { raster: CaptionRaster; clip: Clip; scope: string };
const sameTypography = (a: Clip, b: Clip) =>
  a.text === b.text &&
  a.subtitle === b.subtitle &&
  a.caption_style === b.caption_style &&
  a.font_size === b.font_size &&
  a.color === b.color;

export function captionFade(clip: Clip, time: number) {
  const local = time - clip.start_ms;
  if (local < 0 || local >= clip.duration_ms) return 0;
  const fadeIn = clip.fade_in_ms ? Math.min(1, local / clip.fade_in_ms) : 1;
  const fadeOut = clip.fade_out_ms
    ? Math.min(1, (clip.duration_ms - local) / clip.fade_out_ms)
    : 1;
  return fadeIn * fadeOut;
}
export function upcomingCaptions(project: Project, time: number) {
  return project.tracks
    .filter((track) => track.kind === "text" && !track.muted)
    .flatMap((track) => track.clips)
    .filter((clip) => clip.start_ms > time)
    .sort((a, b) => a.start_ms - b.start_ms)
    .slice(0, 2);
}
export function CaptionPreloader({
  project,
  time,
}: {
  project: Project;
  time: number;
}) {
  const query = useQueryClient();
  const next = JSON.stringify(upcomingCaptions(project, time));
  useEffect(() => {
    for (const clip of JSON.parse(next) as Clip[])
      void query.prefetchQuery(
        reads.captionPreview({ clip, profile: project.profile }),
      );
  }, [query, next, project.profile]);
  return null;
}
export default function CaptionPreview({
  project,
  clip,
  opacity,
  imageStyle,
  children,
}: {
  project: Pick<Project, "profile">;
  clip: Clip;
  opacity: number;
  imageStyle?: (rasterClip: Clip) => CSSProperties;
  children?: (bounds: CaptionBounds | null, rasterClip: Clip) => ReactNode;
}) {
  useLocale();
  const raster = useQuery(
    reads.captionPreview({ clip, profile: project.profile }),
  );
  const [decoded, setDecoded] = useState<DecodedCaption>();
  const [failed, setFailed] = useState<string>();
  const url = raster.data?.url;
  const scope = JSON.stringify([
    clip.id,
    project.profile.width,
    project.profile.height,
  ]);
  const current = useRef({ url, scope });
  useLayoutEffect(() => {
    current.current = { url, scope };
  }, [url, scope]);
  const visible = decoded?.scope === scope ? decoded : undefined;
  const unavailable = !!raster.error || (!!url && failed === url);
  const candidate =
    raster.data && !unavailable
      ? { raster: raster.data, clip, scope }
      : undefined;
  // Decode the replacement alongside the last good image. Keeping its DOM
  // node avoids a blank frame while the server or browser prepares a raster.
  const frames = [
    ...(visible ? [visible] : []),
    ...(candidate && candidate.raster.url !== visible?.raster.url
      ? [candidate]
      : []),
  ];
  return (
    <>
      <div
        className="preview-caption"
        style={{ opacity }}
        aria-busy={!unavailable && (!url || visible?.raster.url !== url)}
      >
        {frames.map((frame) => (
          <img
            key={frame.raster.url}
            src={frame.raster.url}
            style={{
              ...imageStyle?.(frame.clip),
              position: "absolute",
              inset: 0,
              opacity: frame === visible ? 1 : 0,
            }}
            aria-hidden={frame.raster.url !== url || undefined}
            alt={[frame.clip.text, frame.clip.subtitle]
              .filter(Boolean)
              .join("\n")}
            draggable={false}
            onLoad={() => {
              if (
                current.current.url === frame.raster.url &&
                current.current.scope === frame.scope
              )
                setDecoded(frame);
            }}
            onError={() => {
              if (
                current.current.url === frame.raster.url &&
                current.current.scope === frame.scope
              )
                setFailed(frame.raster.url);
            }}
          />
        ))}
        {unavailable && (
          <div className="caption-error" role="alert">
            {tr("Caption preview unavailable.")}
            <button
              className="text-button"
              onClick={() => {
                setFailed(undefined);
                void raster.refetch();
              }}
            >
              {tr("Retry caption preview")}
            </button>
          </div>
        )}
      </div>
      {children?.(
        visible && !unavailable && sameTypography(visible.clip, clip)
          ? visible.raster.bounds
          : null,
        visible?.clip ?? clip,
      )}
    </>
  );
}
