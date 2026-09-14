import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, MoreHorizontal, Trash2, X } from "lucide-react";
import { tr } from "./i18n";
import type { Project, Track } from "./types";
import type { TimelineEdit } from "./TimelineAudioControls";

export default function TimelineTrackMenu({
  track,
  project,
  onEdit,
}: {
  track: Track;
  project: Project;
  onEdit: TimelineEdit;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(track.name);
  const [confirm, setConfirm] = useState(false);
  const [confirmedClips, setConfirmedClips] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const index = project.tracks.findIndex((t) => t.id === track.id);
  const apply = async (type: string, payload: unknown) => {
    setPending(true);
    try {
      await onEdit(type, payload);
      setOpen(false);
    } finally {
      setPending(false);
    }
  };
  const move = (delta: number) => {
    const ids = project.tracks.map((t) => t.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void apply("reorder_tracks", { track_ids: ids });
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        setName(track.name);
        setConfirm(false);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="icon-button track-menu-trigger"
          aria-label={tr("Track settings for {{name}}", { name: track.name })}
          title={tr("Track settings")}
        >
          <MoreHorizontal size={15} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal timeline-track-dialog"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <div className="modal-title">
            <Dialog.Title>{tr("Track settings")}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                disabled={pending}
                className="icon-button"
                aria-label={tr("Close")}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description>
            {tr(
              "Rename, reorder or remove this track. Timeline changes can be undone.",
            )}
          </Dialog.Description>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void apply("update_track", {
                track_id: track.id,
                changes: { name: name.trim() },
              });
            }}
          >
            <label className="field">
              {tr("Track name")}
              <input
                value={name}
                required
                maxLength={200}
                disabled={pending}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="button"
                disabled={pending || index === 0}
                onClick={() => move(-1)}
              >
                <ArrowUp size={15} />
                {tr("Move up")}
              </button>
              <button
                type="button"
                className="button"
                disabled={pending || index === project.tracks.length - 1}
                onClick={() => move(1)}
              >
                <ArrowDown size={15} />
                {tr("Move down")}
              </button>
              <button
                className="button primary"
                disabled={pending || !name.trim()}
              >
                {tr("Save changes")}
              </button>
            </div>
          </form>
          <div className="track-delete-section">
            {confirm ? (
              <>
                <p>
                  {tr(
                    "Remove this track and its {{count}} clips from the timeline? Source files stay in your library.",
                    { count: confirmedClips.length },
                  )}
                </p>
                <div className="dialog-actions">
                  <button
                    className="button"
                    disabled={pending}
                    onClick={() => setConfirm(false)}
                  >
                    {tr("Cancel")}
                  </button>
                  <button
                    className="button danger"
                    disabled={pending}
                    onClick={() =>
                      void apply("delete_timeline_track", {
                        track_id: track.id,
                        clip_ids: confirmedClips,
                      })
                    }
                  >
                    {tr("Remove track and clips")}
                  </button>
                </div>
              </>
            ) : (
              <button
                className="text-button danger-text"
                disabled={pending}
                onClick={() => {
                  if (track.clips.length) {
                    setConfirmedClips(track.clips.map((c) => c.id));
                    setConfirm(true);
                  } else void apply("remove_track", { track_id: track.id });
                }}
              >
                <Trash2 size={15} />
                {tr("Remove track")}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
