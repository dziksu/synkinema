import type { EditStep } from "@/api/generated/client";
import { projectAfter } from "@/api/projectReducer";
import { tr } from "@/lib/i18n";
import type { Asset, Project } from "@/lib/types";
import { layerInsert } from "@/modules/editor/layerInsert";
import { trackHasRoom } from "@/modules/editor/timeline/timelineMath";

type Line = Project["script_lines"][number];

export const scriptVoiceClipId = (lineId: string) => `script-voice-${lineId}`;
export const scriptCaptionClipId = (lineId: string) =>
  `script-caption-${lineId}`;

export function scriptTakeStatus(project: Project, line: Line) {
  const voice = project.tracks
    .filter((track) => track.kind === "voiceover")
    .flatMap((track) => track.clips)
    .filter((clip) => clip.asset_id === line.audio_asset_id);
  const sharedAsset = project.script_lines.some(
    (other) =>
      other.id !== line.id && other.audio_asset_id === line.audio_asset_id,
  );
  const clip =
    voice.find((item) => item.id === scriptVoiceClipId(line.id)) ||
    (voice.length === 1 && !sharedAsset ? voice[0] : undefined);
  const managedCaption = project.tracks
    .filter((track) => track.kind === "text")
    .flatMap((track) => track.clips)
    .find((item) => item.id === scriptCaptionClipId(line.id));
  const matchingCaption = clip
    ? project.tracks
        .filter((track) => track.kind === "text")
        .flatMap((track) => track.clips)
        .find(
          (item) =>
            item.text === line.audio_text &&
            item.start_ms === clip.start_ms &&
            item.duration_ms === clip.duration_ms,
        )
    : undefined;
  const caption = matchingCaption || managedCaption;
  const captionsSynced =
    !!clip &&
    !!caption &&
    caption.text === line.audio_text &&
    caption.start_ms === clip.start_ms &&
    caption.duration_ms === clip.duration_ms;
  return {
    clip,
    caption,
    captionsSynced,
    ambiguous: voice.length > 0 && !clip,
  };
}

function nextOpenTime(
  project: Project,
  requested: number,
  duration: number,
  captions: boolean,
  excludedCaptionId?: string,
) {
  const frame = 1000 / project.profile.fps;
  const ceilFrame = (value: number) =>
    Math.round(Math.ceil(value / frame) * frame);
  const occupied = project.tracks
    .filter(
      (track) =>
        !track.muted &&
        (track.kind === "voiceover" || (captions && track.kind === "text")),
    )
    .flatMap((track) => track.clips)
    .filter((clip) => clip.id !== excludedCaptionId)
    .sort((a, b) => a.start_ms - b.start_ms);
  let start = ceilFrame(Math.max(0, requested));
  for (const clip of occupied) {
    if (clip.start_ms + clip.duration_ms <= start) continue;
    if (clip.start_ms >= start + duration) break;
    start = ceilFrame(clip.start_ms + clip.duration_ms);
  }
  if (start + duration > 86_400_000)
    throw new Error(tr("This take does not fit within the 24-hour timeline."));
  return start;
}

function captionInput(line: Line, start: number, duration: number) {
  if (!line.audio_text?.trim())
    throw new Error(tr("This take has no spoken text for subtitles."));
  if (line.audio_text.length > 2000)
    throw new Error(
      tr(
        "Split this script line before adding subtitles (2,000 characters maximum).",
      ),
    );
  return {
    id: scriptCaptionClipId(line.id),
    name: tr("Script subtitles"),
    text: line.audio_text,
    start_ms: start,
    duration_ms: duration,
    caption_style: "boxed" as const,
    text_auto_center: true,
    font_size: 64,
    text_y: 0.78,
    transition: { type: "cut" as const, duration_ms: 0 },
  };
}

export type ScriptTakePlacement = {
  steps: EditStep[];
  start_ms: number;
  selected_id: string;
};

export function planScriptTake(
  project: Project,
  line: Line,
  asset: Asset,
  requested: number,
  withCaptions: boolean,
): ScriptTakePlacement {
  if (
    line.audio_asset_id !== asset.id ||
    asset.kind !== "audio" ||
    !asset.has_audio ||
    !asset.duration_ms ||
    asset.duration_ms < 100
  )
    throw new Error(
      tr(
        "This line needs a ready audio take before it can be placed on the timeline.",
      ),
    );
  const status = scriptTakeStatus(project, line);
  if (status.ambiguous)
    throw new Error(
      tr(
        "This take is used more than once on the timeline. Arrange its subtitles in Edit.",
      ),
    );

  if (status.clip) {
    if (!withCaptions)
      throw new Error(tr("This take is already on the timeline."));
    if (
      status.clip.source_in_ms !== 0 ||
      Math.abs(
        status.clip.duration_ms * status.clip.speed - asset.duration_ms,
      ) > 100
    )
      throw new Error(
        tr("This take was trimmed or split. Align subtitles manually in Edit."),
      );
    if (status.captionsSynced)
      throw new Error(tr("Subtitles are already synchronized with this take."));
    const input = captionInput(
      line,
      status.clip.start_ms,
      status.clip.duration_ms,
    );
    if (
      project.tracks
        .filter((track) => track.kind === "text" && !track.muted)
        .some(
          (track) =>
            !trackHasRoom(
              track,
              input.start_ms,
              input.duration_ms,
              status.caption?.id,
            ),
        )
    )
      throw new Error(
        tr(
          "Another subtitle overlaps this take. Adjust the text track in Edit first.",
        ),
      );
    if (status.caption) {
      const track = project.tracks.find((item) =>
        item.clips.some((clip) => clip.id === status.caption?.id),
      )!;
      return {
        steps: [
          {
            type: "update_clip",
            payload: {
              track_id: track.id,
              clip_id: status.caption.id,
              changes: {
                text: input.text,
                start_ms: input.start_ms,
                duration_ms: input.duration_ms,
              },
            },
          },
        ],
        start_ms: status.clip.start_ms,
        selected_id: status.caption.id,
      };
    }
    const captions = layerInsert(project, "text", input);
    return {
      steps: captions.steps,
      start_ms: status.clip.start_ms,
      selected_id: input.id,
    };
  }

  if (withCaptions) captionInput(line, 0, asset.duration_ms);
  const start = nextOpenTime(
    project,
    requested,
    asset.duration_ms,
    withCaptions,
    status.caption?.id,
  );
  const voice = layerInsert(project, "voiceover", {
    id: scriptVoiceClipId(line.id),
    name: (line.audio_text || asset.name).slice(0, 300),
    asset_id: asset.id,
    start_ms: start,
    duration_ms: asset.duration_ms,
    gain_db: -18,
  });
  if (!withCaptions)
    return {
      steps: voice.steps,
      start_ms: voice.start_ms,
      selected_id: scriptVoiceClipId(line.id),
    };
  if (status.caption) {
    const captionTrack = project.tracks.find((track) =>
      track.clips.some((clip) => clip.id === status.caption?.id),
    )!;
    const input = captionInput(line, voice.start_ms, asset.duration_ms);
    return {
      steps: [
        ...voice.steps,
        {
          type: "update_clip",
          payload: {
            track_id: captionTrack.id,
            clip_id: status.caption.id,
            changes: {
              text: input.text,
              start_ms: input.start_ms,
              duration_ms: input.duration_ms,
            },
          },
        },
      ],
      start_ms: voice.start_ms,
      selected_id: scriptVoiceClipId(line.id),
    };
  }
  const caption = layerInsert(
    projectAfter(project, voice),
    "text",
    captionInput(line, voice.start_ms, asset.duration_ms),
  );
  return {
    steps: [...voice.steps, ...caption.steps],
    start_ms: voice.start_ms,
    selected_id: scriptVoiceClipId(line.id),
  };
}
