import { tr, useLocale } from "@/lib/i18n";
import type { Asset } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import { usableAsset } from "@/modules/editor/timeline/timelineMath";
import { Film, Image, Music2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function sourceLink(source: string): string | undefined {
  const match = source.match(/https?:\/\/[^\s|]+/i)?.[0];
  if (!match) return undefined;
  try {
    return new URL(match).href;
  } catch {
    return undefined;
  }
}

export const assetDuration = (asset: Asset) =>
  asset.duration_ms && asset.duration_ms < 1000
    ? `${asset.duration_ms} ms`
    : asset.duration_ms
      ? `${(asset.duration_ms / 1000).toFixed(1)} s`
      : tr("IMG");

/**
 * Compact media tile: click opens the preview monitor, hovering a video plays a
 * muted loop, "+" inserts at the playhead and dragging places it on a track.
 */
export default function AssetCard({
  asset,
  onAdd,
  onPreview,
  active = false,
}: {
  asset: Asset;
  onAdd: () => void;
  onPreview?: () => void;
  active?: boolean;
}) {
  useLocale();
  const usable = usableAsset(asset);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const Kind =
    asset.kind === "video" ? Film : asset.kind === "audio" ? Music2 : Image;
  return (
    <article
      className={`media-tile ${active ? "active" : ""} ${usable ? "" : "unusable"}`}
      onPointerEnter={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setHover(true), 250);
      }}
      onPointerLeave={() => {
        clearTimeout(timer.current);
        setHover(false);
      }}
    >
      <button
        type="button"
        className="media-tile-preview"
        aria-label={tr("Preview {{name}}", { name: asset.name })}
        title={
          usable
            ? tr("Click to preview · drag onto the timeline")
            : tr("Media is shorter than the minimum clip duration of 100 ms")
        }
        onClick={onPreview}
        draggable={usable}
        onDragStart={(e) => {
          setHover(false);
          e.dataTransfer.setData("application/synkinema-asset", asset.id);
          e.dataTransfer.effectAllowed = "copy";
          const thumb = e.currentTarget.querySelector("img");
          if (thumb) e.dataTransfer.setDragImage(thumb, 24, 18);
          useStudio
            .getState()
            .set({ draggingAsset: asset.id, draggingSource: null });
        }}
        onDragEnd={() =>
          useStudio
            .getState()
            .set({ draggingAsset: null, draggingSource: null })
        }
      >
        {asset.thumbnail_url ? (
          <img
            src={asset.thumbnail_url}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="media-tile-placeholder">
            <Kind size={20} />
          </span>
        )}
        {hover && asset.kind === "video" && (
          <video
            src={asset.url}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            aria-hidden
          />
        )}
        <span className="media-tile-kind">
          <Kind size={11} />
        </span>
        <span className="media-tile-duration">{assetDuration(asset)}</span>
      </button>
      <button
        type="button"
        className="media-tile-add"
        disabled={!usable}
        aria-label={tr("Insert {{name}} at playhead", { name: asset.name })}
        title={tr("Insert at playhead")}
        onClick={onAdd}
      >
        <Plus size={14} />
      </button>
      <span className="media-tile-name" title={asset.name}>
        {asset.name}
      </span>
    </article>
  );
}
