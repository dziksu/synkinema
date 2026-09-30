import type { Asset, Project } from "@/lib/types";
import { Film } from "lucide-react";
import { useState } from "react";

export function projectThumbnailSources(project: Project, assets: Asset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  // Prefer the main footage over logos/overlays, then timeline order rather
  // than insertion order. Audio-only and muted tracks cannot supply a cover.
  const sources = (["video", "overlay"] as const).flatMap((kind) =>
    project.tracks
      .filter((track) => track.kind === kind && !track.muted)
      .flatMap((track) => track.clips)
      .sort((a, b) => a.start_ms - b.start_ms)
      .flatMap((clip) => {
        const asset = clip.asset_id ? byId.get(clip.asset_id) : undefined;
        if (!asset || (asset.kind !== "video" && asset.kind !== "image"))
          return [];
        return [
          ...(asset.thumbnail_url ? [asset.thumbnail_url] : []),
          ...(asset.kind === "image" ? [asset.url] : []),
        ];
      }),
  );
  return [...new Set(sources)];
}

function ThumbnailImage({
  sources,
  project,
}: {
  sources: string[];
  project: Project;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = sources.find((source) => !failed.includes(source));
  if (!src) {
    const tint =
      [...project.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
    const initials = project.name
      .split(/[\s—•-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    return (
      <div
        className={`project-poster project-poster-${tint}`}
        aria-hidden="true"
      >
        <span className="project-poster-reel">
          <Film />
        </span>
        <span className="project-poster-initials">{initials}</span>
        <span className="project-poster-title">{project.name}</span>
      </div>
    );
  }
  return (
    <img
      key={src}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed((previous) => [...previous, src])}
    />
  );
}

export default function ProjectThumbnail({
  project,
  assets,
}: {
  project: Project;
  assets: Asset[];
}) {
  const sources = projectThumbnailSources(project, assets);
  return (
    <ThumbnailImage
      key={JSON.stringify(sources)}
      sources={sources}
      project={project}
    />
  );
}
