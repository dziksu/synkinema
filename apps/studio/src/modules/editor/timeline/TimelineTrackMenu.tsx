import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { tr } from "@/lib/i18n";
import type { Project, Track } from "@/lib/types";
import type { TimelineEdit } from "@/modules/editor/timeline/TimelineAudioControls";
import { ArrowDown, ArrowUp, MoreHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

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
  const form = useForm({ defaultValues: { name: track.name } });
  const name = form.watch("name");
  const setName = (value: string) =>
    form.setValue("name", value, { shouldDirty: true });
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
    <DialogRoot
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        setName(track.name);
        setConfirm(false);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="icon-button track-menu-trigger"
          aria-label={tr("Track settings for {{name}}", { name: track.name })}
          title={tr("Track settings")}
        >
          <MoreHorizontal size={15} />
        </Button>
      </DialogTrigger>
      <>
        <DialogContent
          showCloseButton={false}
          className="modal timeline-track-dialog"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>{tr("Track settings")}</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                className="icon-button"
                aria-label={tr("Close")}
              >
                <X size={18} />
              </Button>
            </DialogClose>
          </DialogHeader>
          <DialogForm
            onSubmit={form.handleSubmit(() => {
              if (confirm) return;
              void apply("update_track", {
                track_id: track.id,
                changes: { name: name.trim() },
              });
            })}
          >
            <DialogBody>
              <DialogDescription>
                {tr(
                  "Rename, reorder or remove this track. Timeline changes can be undone.",
                )}
              </DialogDescription>
              <label className="field">
                {tr("Track name")}
                <Input
                  value={name}
                  required
                  maxLength={200}
                  disabled={pending}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {confirm && (
                <p>
                  {tr(
                    "Remove this track and its {{count}} clips from the timeline? Source files stay in your library.",
                    { count: confirmedClips.length },
                  )}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              {!confirm && (
                <>
                  <Button
                    variant="outline"
                    type="button"
                    className="button"
                    disabled={pending || index === 0}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={15} />
                    {tr("Move up")}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    className="button"
                    disabled={pending || index === project.tracks.length - 1}
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={15} />
                    {tr("Move down")}
                  </Button>
                  <Button
                    variant="default"
                    className="button primary"
                    disabled={pending || !name.trim()}
                  >
                    {tr("Save changes")}
                  </Button>
                </>
              )}
              {confirm ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="button"
                    disabled={pending}
                    onClick={() => setConfirm(false)}
                  >
                    {tr("Cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
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
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
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
                </Button>
              )}
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </>
    </DialogRoot>
  );
}
