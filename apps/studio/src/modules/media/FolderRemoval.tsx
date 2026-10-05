import { DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { writes } from "@/api/mutations";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { tr } from "@/lib/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
export default function FolderRemoval({
  folderId,
  projectId,
  name,
  onClose,
  onDone,
}: {
  folderId: string;
  projectId?: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutation = useMutation(writes.deleteFolder(useQueryClient()));
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <>
        <DialogContent showCloseButton={false} className="modal">
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>{tr("Delete folder?")}</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="icon-button"
                aria-label={tr("Close")}
                disabled={mutation.isPending}
              >
                <X size={20} />
              </Button>
            </DialogClose>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {tr(
                "The folder is removed and its files move to this collection's root. No media is deleted.",
              )}
            </DialogDescription>
            <p className="deletion-project-name">{name}</p>
            {mutation.error && (
              <p role="alert" className="error-banner">
                {mutation.error.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="button"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {tr("Cancel")}
            </Button>
            <Button
              variant="destructive"
              className="button danger-outline"
              disabled={mutation.isPending}
              onClick={async () => {
                try {
                  await mutation.mutateAsync({ folderId, projectId });
                  onDone();
                } catch {
                  /* Keep failure visible. */
                }
              }}
            >
              {tr("Delete folder, keep files")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </>
    </DialogRoot>
  );
}
