import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { tr } from "./i18n";
import type { ReactNode } from "react";

export default function ConfirmDelete({
  title,
  children,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal deletion-modal"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <div className="modal-title">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                aria-label={tr("Close")}
                disabled={pending}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description asChild>
            <div className="deletion-description">{children}</div>
          </Dialog.Description>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button className="button" onClick={onClose} disabled={pending}>
              {tr("Keep files")}
            </button>
            <button
              className="button danger"
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Trash2 size={17} />
              )}
              {pending ? tr("Deleting files…") : tr("Delete permanently")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
