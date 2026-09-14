import type { Project } from "./types";
import type { EditStep } from "./api/generated/client";
import { tr } from "./i18n";

export function deleteTimelineTrack(
  project: Project,
  trackId: string,
  clipIds: string[],
): EditStep[] {
  const track = project.tracks.find((t) => t.id === trackId);
  if (
    !track ||
    track.clips.length !== clipIds.length ||
    track.clips.some((c) => !clipIds.includes(c.id))
  )
    throw new Error(
      tr("This track changed. Review its clips before deleting it."),
    );
  return [
    {
      type: "remove_track",
      payload: { track_id: trackId, remove_clips: true },
    },
  ];
}
