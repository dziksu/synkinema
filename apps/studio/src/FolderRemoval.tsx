import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { writes } from "./api/mutations";
import { tr } from "./i18n";
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
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-title">
            <Dialog.Title>{tr("Delete folder?")}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                aria-label={tr("Close")}
                disabled={mutation.isPending}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description>
            {tr(
              "The folder is removed and its files move to this collection's root. No media is deleted.",
            )}
          </Dialog.Description>
          <p className="deletion-project-name">{name}</p>
          {mutation.error && (
            <p role="alert" className="error-banner">
              {mutation.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {tr("Cancel")}
            </button>
            <button
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
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
