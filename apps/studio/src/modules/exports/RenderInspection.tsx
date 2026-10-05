import { DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { reads } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { tr, useLocale } from "@/lib/i18n";
import type { Job } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Frame, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

export default function RenderInspection({ job }: { job: Job }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const {
    data: sheet,
    isFetching: busy,
    error: queryError,
    refetch,
  } = useQuery({
    ...reads.sheet(job.project_id, { job_id: job.id }),
    enabled: open,
  });
  const error = queryError?.message || "";
  function inspect() {
    if (open) void refetch();
    else setOpen(true);
  }
  return (
    <>
      <Button
        variant="outline"
        className="button"
        onClick={() => void inspect()}
      >
        <Frame size={17} /> {tr("Inspect frames")}{" "}
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <>
          <DialogContent showCloseButton={false} className="modal">
            <DialogHeader className="flex-row items-center justify-between">
              <DialogTitle>
                {tr("Export frames · {{name}}", { name: job.project_name })}
              </DialogTitle>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="icon-button"
                  aria-label={tr("Close")}
                >
                  <X size={20} />
                </Button>
              </DialogClose>
            </DialogHeader>
            <DialogBody>
              <DialogDescription>
                {" "}
                {tr(
                  "Frames from this MP4 file · revision {{revision}}. Frame times match the project timeline.",
                  { revision: job.revision },
                )}{" "}
              </DialogDescription>
              {busy && (
                <p role="status">
                  <LoaderCircle size={18} className="spin" />{" "}
                  {tr("Preparing export frames…")}{" "}
                </p>
              )}
              {error && (
                <div role="alert">
                  <p>{error}</p>
                  <Button
                    variant="outline"
                    className="button"
                    onClick={() => void inspect()}
                  >
                    {" "}
                    {tr("Try again")}{" "}
                  </Button>
                </div>
              )}
              {sheet && (
                <>
                  <p>
                    {" "}
                    {tr("Range: {{from}}–{{to}} s · revision {{revision}}", {
                      from: (sheet.from_ms / 1000).toFixed(2),
                      to: (sheet.to_ms / 1000).toFixed(2),
                      revision: sheet.revision,
                    })}
                  </p>
                  <img
                    className="inspection-image"
                    src={sheet.url}
                    alt={tr(
                      "Export contact sheet for {{name}}, revision {{revision}}",
                      { name: job.project_name, revision: sheet.revision },
                    )}
                  />
                </>
              )}
            </DialogBody>
            {sheet && (
              <DialogFooter>
                <Button variant="outline" asChild>
                  <a href={sheet.url} download>
                    {tr("Download contact sheet")}
                  </a>
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </>
      </DialogRoot>
    </>
  );
}
