import type { Clip, Project } from "./types";

function continuesSource(previous: Clip, clip: Clip) {
  return (
    !!clip.asset_id &&
    !clip.shape &&
    !previous.shape &&
    clip.asset_id === previous.asset_id &&
    clip.transition.type === "cut" &&
    clip.speed === previous.speed &&
    clip.start_ms === previous.start_ms + previous.duration_ms &&
    Math.abs(
      clip.source_in_ms -
        (previous.source_in_ms + previous.duration_ms * previous.speed),
    ) < 0.000001
  );
}

export function previewLayers(project: Project, time: number) {
  return project.tracks
    .filter(
      (track) =>
        !track.muted && ["video", "overlay", "text"].includes(track.kind),
    )
    .sort((a, b) => Number(b.kind === "video") - Number(a.kind === "video"))
    .flatMap((track) => {
      let previous: Clip | undefined;
      let sourceRun = "";
      return [...track.clips]
        .sort((a, b) => a.start_ms - b.start_ms)
        .map((clip) => {
          // Preserve the DOM/decoder for adjacent slices of one continuous
          // source. Derive the run before filtering by playhead, so its key
          // stays stable as clips enter/leave the visible composition.
          if (
            track.kind === "text" ||
            !previous ||
            !continuesSource(previous, clip)
          )
            sourceRun = clip.id;
          previous = clip;
          return {
            track,
            clip,
            key: JSON.stringify([project.id, track.id, sourceRun]),
          };
        });
    })
    .filter(
      ({ clip }) =>
        time >= clip.start_ms && time < clip.start_ms + clip.duration_ms,
    );
}
