import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { tr } from "./i18n";
import { elementMime, type Shape } from "./layerInsert";
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
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          className={`element-picker ${dragging ? "is-dragging" : ""}`}
          onPointerDownOutside={(e) => {
            if (dragging) e.preventDefault();
          }}
        >
          <div className="modal-title">
            <Dialog.Title>{tr("Add an element")}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label={tr("Close")}>
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description>
            {tr(
              "Click to add at the playhead, or drag onto the preview. Occupied layers create a new track.",
            )}
          </Dialog.Description>
          <div className="element-choices">
            {(
              [
                ["rectangle", tr("Rectangle")],
                ["ellipse", tr("Ellipse")],
                ["line", tr("Line")],
              ] as const
            ).map(([shape, label]) => (
              <button
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
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
