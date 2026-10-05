import { DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { tr } from "@/lib/i18n";
import { LoaderCircle, Trash2, X } from "lucide-react";
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
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <>
        <DialogContent
          showCloseButton={false}
          className="modal deletion-modal"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>{title}</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="icon-button"
                aria-label={tr("Close")}
                disabled={pending}
              >
                <X size={20} />
              </Button>
            </DialogClose>
          </DialogHeader>
          <DialogBody>
            <DialogDescription asChild>
              <div className="deletion-description">{children}</div>
            </DialogDescription>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="button"
              onClick={onClose}
              disabled={pending}
            >
              {tr("Keep files")}
            </Button>
            <Button
              variant="destructive"
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
            </Button>
          </DialogFooter>
        </DialogContent>
      </>
    </DialogRoot>
  );
}
