import { writes } from "@/api/mutations";
import PageHeader from "@/components/PageHeader";
import { ErrorState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tr } from "@/lib/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import type { MediaDestination } from "./MediaBrowser";
import MediaLibrary from "./MediaLibrary";

export function LibraryPage() {
  const client = useQueryClient();
  const [destination, setDestination] = useState<MediaDestination>({});
  const upload = useMutation({
    ...writes.upload(client),
    onSuccess: () => toast.success(tr("Media imported")),
  });
  const drop = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files.length)
        upload.mutate({ files, destination: { ...destination } });
    },
    accept: { "video/*": [], "image/*": [], "audio/*": [] },
  });
  return (
    <div {...drop.getRootProps()} className="relative">
      <Input
        {...drop.getInputProps()}
        aria-label={tr("Choose files to import")}
      />
      <PageHeader
        eyebrow={tr("Media workspace")}
        title={tr("Your media, ready to create.")}
        description={tr(
          "Organize sources, manage shared collections, and find the right shot.",
        )}
        action={
          <Button onClick={drop.open} disabled={upload.isPending}>
            {upload.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Upload />
            )}
            {tr(upload.isPending ? "Importing media…" : "Import media")}
          </Button>
        }
      />
      {upload.error && <ErrorState error={upload.error} />}
      <div className="px-6 pb-8 lg:px-9">
        <MediaLibrary
          onDestination={setDestination}
          onNotice={(message) => toast(message)}
        />
      </div>
      {drop.isDragActive && (
        <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/90 text-lg">
          {tr("Drop media here")}
        </div>
      )}
    </div>
  );
}
