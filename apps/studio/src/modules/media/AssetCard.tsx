import { tr, useLocale } from "@/lib/i18n";
import type { Asset } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import { usableAsset } from "@/modules/editor/timeline/timelineMath";
import { scriptTakeStatus } from "@/modules/script/scriptTimeline";
import { Captions, Check, Film, Image, Music2, Plus } from "lucide-react";
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
  selectionMode = false,
  selected = false,
  onSelect,
  narration,
}: {
  asset: Asset;
  onAdd: () => void;
  onPreview?: () => void;
  active?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  narration?: {
    status: ReturnType<typeof scriptTakeStatus>;
    canCaption: boolean;
    onAddCaptions: () => void;
  };
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
      className={`media-tile ${active ? "active" : ""} ${selected ? "selected" : ""} ${usable ? "" : "unusable"}`}
      onPointerEnter={() => {
        clearTimeout(timer.current);
        if (!selectionMode)
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
        aria-label={
          selectionMode
            ? selected
              ? tr("Deselect {{name}}", { name: asset.name })
              : tr("Select {{name}}", { name: asset.name })
            : tr("Preview {{name}}", { name: asset.name })
        }
        title={
          selectionMode
            ? tr("Click to select media")
            : usable
              ? tr("Click to preview · drag onto the timeline")
              : tr("Media is shorter than the minimum clip duration of 100 ms")
        }
        onClick={selectionMode ? onSelect : onPreview}
        draggable={usable && !selectionMode}
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
      {onSelect && (
        <button
          type="button"
          className="media-tile-select"
          aria-label={
            selected
              ? tr("Deselect {{name}}", { name: asset.name })
              : tr("Select {{name}}", { name: asset.name })
          }
          aria-pressed={selected}
          title={selected ? tr("Deselect media") : tr("Select media")}
          onClick={onSelect}
        >
          {selected && <Check size={13} strokeWidth={3} />}
        </button>
      )}
      {!selectionMode && (
        <button
          type="button"
          className="media-tile-add"
          disabled={
            !usable || !!narration?.status.clip || !!narration?.status.ambiguous
          }
          aria-label={
            narration
              ? tr("Add narration {{name}} at playhead", { name: asset.name })
              : tr("Insert {{name}} at playhead", { name: asset.name })
          }
          title={
            narration?.status.clip
              ? tr("Narration is already on the timeline")
              : tr("Insert at playhead")
          }
          onClick={onAdd}
        >
          <Plus size={14} />
        </button>
      )}
      <span className="media-tile-name" title={asset.name}>
        {asset.name}
      </span>
      {!selectionMode &&
        narration &&
        (narration.status.ambiguous ? (
          <span className="media-tile-caption-status">
            {tr("Used multiple times")}
          </span>
        ) : narration.status.captionsSynced ? (
          <span className="media-tile-caption-status">
            <Captions size={12} /> {tr("Audio + subtitles")}
          </span>
        ) : (
          <button
            type="button"
            className="media-tile-caption-action"
            disabled={!usable || !narration.canCaption}
            title={
              narration.canCaption
                ? narration.status.clip
                  ? tr("Add or synchronize subtitles for this narration")
                  : tr(
                      "Place narration and a matching subtitle clip on the timeline",
                    )
                : tr("Split long script lines before adding subtitles")
            }
            onClick={narration.onAddCaptions}
          >
            <Captions size={12} />
            {narration.status.clip
              ? narration.status.caption
                ? tr("Sync subtitles")
                : tr("Add subtitles")
              : tr("Audio + subtitles")}
          </button>
        ))}
    </article>
  );
}
