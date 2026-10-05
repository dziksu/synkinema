import { DialogBody, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { tr } from "@/lib/i18n";
import { elementMime, type Shape } from "@/modules/editor/layerInsert";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
export default function ElementPicker({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInsert: (shape: Shape) => void;
}) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!open) setDragging(false);
  }, [open]);
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange} modal={false}>
      <>
        <DialogContent
          showCloseButton={false}
          className={`element-picker ${dragging ? "is-dragging" : ""}`}
          onPointerDownOutside={(e) => {
            if (dragging) e.preventDefault();
          }}
        >
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>{tr("Add an element")}</DialogTitle>
            <DialogClose className="icon-button" aria-label={tr("Close")}>
              <X size={18} />
            </DialogClose>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {tr(
                "Click to add at the playhead, or drag onto the preview. Occupied layers create a new track.",
              )}
            </DialogDescription>
            <div className="element-choices">
              {(
                [
                  ["rectangle", tr("Rectangle")],
                  ["ellipse", tr("Ellipse")],
                  ["line", tr("Line")],
                ] as const
              ).map(([shape, label]) => (
                <Button
                  variant="outline"
                  key={shape}
                  className="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(elementMime, shape);
                    e.dataTransfer.effectAllowed = "copy";
                    setDragging(true);
                  }}
                  onDragEnd={() => setDragging(false)}
                  onClick={() => onInsert(shape)}
                >
                  <span className={`shape-sample shape-${shape}`} />
                  {label}
                </Button>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </>
    </DialogRoot>
  );
}
