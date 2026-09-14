import { useLocale, tr } from "./i18n";
import { useState } from "react";
import { Frame, LoaderCircle, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { reads } from "./api/queries";
import type { Job } from "./types";

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
      <button className="button" onClick={() => void inspect()}>
        <Frame size={17} /> {tr("Inspect frames")}{" "}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal">
            <div className="modal-title">
              <Dialog.Title>
                {tr("Export frames · {{name}}", { name: job.project_name })}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="icon-button" aria-label={tr("Close")}>
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description>
              {" "}
              {tr(
                "Frames from this MP4 file · revision {{revision}}. Frame times match the project timeline.",
                { revision: job.revision },
              )}{" "}
            </Dialog.Description>
            {busy && (
              <p role="status">
                <LoaderCircle size={18} className="spin" />{" "}
                {tr("Preparing export frames…")}{" "}
              </p>
            )}
            {error && (
              <div role="alert">
                <p>{error}</p>
                <button className="button" onClick={() => void inspect()}>
                  {" "}
                  {tr("Try again")}{" "}
                </button>
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
                <a href={sheet.url} download className="button">
                  {" "}
                  {tr("Download contact sheet")}{" "}
                </a>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
