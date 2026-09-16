import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import type { Track } from "@/lib/types";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import type { TimelineEdit } from "./TimelineAudioControls";

const HandleContext = createContext<
  ((element: Element | null) => void) | undefined
>(undefined);
export function TrackSorting({
  tracks,
  onEdit,
  children,
}: {
  tracks: Track[];
  onEdit: TimelineEdit;
  children: ReactNode;
}) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled || !event.operation.target) return;
        const ids = tracks.map((track) => track.id);
        const next = move(ids, event);
        if (next.some((id, index) => id !== ids[index]))
          onEdit("reorder_tracks", { track_ids: next });
      }}
    >
      {children}
    </DragDropProvider>
  );
}
export function SortableTrack({
  track,
  index,
  className,
  children,
}: {
  track: Track;
  index: number;
  className: string;
  children: ReactNode;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: track.id,
    index,
    type: "timeline-track",
    group: "timeline-tracks",
  });
  return (
    <HandleContext value={handleRef}>
      <div ref={ref} className={className} data-dragging={isDragging}>
        {children}
      </div>
    </HandleContext>
  );
}
export function TrackHandle({ name }: { name: string }) {
  const handle = useContext(HandleContext);
  return (
    <Button
      ref={handle}
      type="button"
      variant="ghost"
      size="icon-sm"
      className="track-grip"
      aria-label={tr("Move track {{name}}", { name })}
      title={tr("Drag or use the keyboard to reorder tracks")}
    >
      <GripVertical className="size-3" />
    </Button>
  );
}
