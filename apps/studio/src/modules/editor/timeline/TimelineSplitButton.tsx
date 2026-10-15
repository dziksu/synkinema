import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import type { Clip, Track } from "@/lib/types";
import { useStudio } from "@/modules/editor/store";
import type { TimelineEdit } from "./TimelineAudioControls";
import { Scissors } from "lucide-react";

export default function TimelineSplitButton({
  clip,
  track,
  pending = false,
  compact = false,
  onEdit,
}: {
  clip?: Clip;
  track?: Track;
  pending?: boolean;
  compact?: boolean;
  onEdit: TimelineEdit;
}) {
  const time = Math.round(useStudio((s) => s.time));
  const disabled =
    pending ||
    !clip ||
    !track ||
    time - clip.start_ms < 100 ||
    clip.start_ms + clip.duration_ms - time < 100;
  const split = () => {
    if (disabled) return;
    onEdit("split_clip", {
      track_id: track.id,
      clip_id: clip.id,
      time_ms: time,
    });
  };
  return compact ? (
    <IconButton
      label={tr("Split clip at playhead")}
      disabled={disabled}
      onClick={split}
    >
      <Scissors size={16} />
    </IconButton>
  ) : (
    <Button
      variant="ghost"
      className="text-button"
      disabled={disabled}
      onClick={split}
    >
      <Scissors size={14} />
      {tr("Split at playhead")}
    </Button>
  );
}
