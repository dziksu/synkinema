import { Button } from "@/components/ui/button";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import { usableAsset } from "@/modules/editor/timeline/timelineMath";
import { Music2, Pause, Play, Plus, Scissors } from "lucide-react";
import { useRef, useState } from "react";

export function sourceLink(source: string): string | undefined {
  const match = source.match(/https?:\/\/[^\s|]+/i)?.[0];
  if (!match) return undefined;
  try {
    return new URL(match).href;
  } catch {
    return undefined;
  }
}

export default function AssetCard({
  asset,
  onAdd,
  onPreview,
}: {
  asset: Asset;
  onAdd: () => void;
  onPreview?: () => void;
}) {
  useLocale();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const duration =
    asset.duration_ms && asset.duration_ms < 1000
      ? `${asset.duration_ms} ms`
      : asset.duration_ms
        ? `${(asset.duration_ms / 1000).toFixed(1)} s`
        : tr("IMG");
  return (
    <article className="asset-shell">
      <button
        type="button"
        className="asset-card"
        title={
          usableAsset(asset)
            ? tr("Add {{name}} to timeline", { name: asset.name })
            : tr("Media is shorter than the minimum clip duration of 100 ms")
        }
        onClick={onAdd}
        draggable={usableAsset(asset)}
        disabled={!usableAsset(asset)}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/synkinema-asset", asset.id);
          e.dataTransfer.effectAllowed = "copy";
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
        <div>
          {asset.thumbnail_url ? (
            <img
              src={asset.thumbnail_url}
              alt=""
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="audio-thumb">
              <Music2 size={24} />
            </div>
          )}
          <span className="asset-add">
            <Plus size={14} />
          </span>
          <span className="asset-duration">{duration}</span>
        </div>
        <strong>{asset.name}</strong>
      </button>
      {onPreview && asset.kind !== "image" && usableAsset(asset) && (
        <Button
          variant="outline"
          className="asset-source-button"
          aria-label={tr("Select source range from {{name}}", {
            name: asset.name,
          })}
          onClick={() => {
            audio.current?.pause();
            onPreview();
          }}
        >
          <Scissors size={13} /> {tr("Select source range")}{" "}
        </Button>
      )}
      {asset.kind === "audio" && (
        <>
          <audio
            ref={audio}
            data-asset-audition
            src={asset.url}
            preload="none"
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            onPlay={() => {
              document
                .querySelectorAll<HTMLAudioElement>(
                  "audio[data-asset-audition]",
                )
                .forEach((a) => {
                  if (a !== audio.current) a.pause();
                });
              setPlaying(true);
            }}
          />
          <button
            type="button"
            className="asset-audition"
            aria-label={
              playing
                ? tr("Stop auditioning {{name}}", { name: asset.name })
                : tr("Audition {{name}}", { name: asset.name })
            }
            title={playing ? tr("Stop audition") : tr("Audition before adding")}
            onClick={async () => {
              if (!audio.current) return;
              if (playing) {
                audio.current.pause();
                audio.current.currentTime = 0;
              } else {
                setError(false);
                audio.current.currentTime = 0;
                try {
                  await audio.current.play();
                } catch {
                  setError(true);
                }
              }
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          {error && (
            <small role="status">{tr("Unable to play this file.")}</small>
          )}
        </>
      )}
    </article>
  );
}
