import type { EditStep } from "@/api/generated/client";
import { createId } from "@/lib/createId";
import { tr } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { locate, withLinked } from "./timelineEditing";

/** Copy a selection after itself, moving every copy by the same collision-free
 * offset. Internal transitions survive; an incoming transition from an
 * unselected predecessor is detached. The result is one atomic project edit. */
export function duplicateSteps(
  project: Project,
  selectedIds: string[],
  linking = true,
): EditStep[] {
  if (!selectedIds.length || selectedIds.some((id) => !locate(project, id)))
    throw new Error(tr("This clip is no longer available."));
  const ids = new Set(withLinked(project, selectedIds, linking));
  const members = project.tracks.flatMap((track) =>
    [...track.clips]
      .sort((a, b) => a.start_ms - b.start_ms)
      .filter((clip) => ids.has(clip.id))
      .map((clip) => ({ track, clip })),
  );
  const start = Math.min(...members.map(({ clip }) => clip.start_ms));
  const end = Math.max(
    ...members.map(({ clip }) => clip.start_ms + clip.duration_ms),
  );
  let offset = end - start;
  // Each collision advances past an existing interval. Repeat across lanes so
  // a later lane cannot push earlier copies into another occupied interval.
  while (true) {
    let next = offset;
    for (const { track, clip } of members)
      for (const neighbor of track.clips)
        if (
          clip.start_ms + offset < neighbor.start_ms + neighbor.duration_ms &&
          clip.start_ms + offset + clip.duration_ms > neighbor.start_ms
        )
          next = Math.max(
            next,
            neighbor.start_ms + neighbor.duration_ms - clip.start_ms,
          );
    if (next === offset) break;
    offset = next;
  }
  return members.map(({ track, clip }) => {
    const ordered = [...track.clips].sort((a, b) => a.start_ms - b.start_ms);
    const previous =
      ordered[ordered.findIndex((item) => item.id === clip.id) - 1];
    return {
      type: "add_clip",
      payload: {
        track_id: track.id,
        clip: {
          ...structuredClone(clip),
          id: createId(),
          name: tr("{{name}} — copy", { name: clip.name }).slice(0, 300),
          start_ms: clip.start_ms + offset,
          transition:
            previous && ids.has(previous.id)
              ? { ...clip.transition }
              : { type: "cut", duration_ms: 0 },
        },
      },
    };
  });
}
