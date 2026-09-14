import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { reads } from "./api/queries";
import { projectWrites } from "./api/projectMutations";
import { tr } from "./i18n";

export default function ChannelProjectUnlinker({
  channelId,
  project,
  onClose,
}: {
  channelId: string;
  project: { id: string; name: string };
  onClose: () => void;
}) {
  const client = useQueryClient();
  const edit = useMutation(projectWrites(client));
  const pendingEdits = useIsMutating({ mutationKey: ["project-edit"] });
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const busy = preparing || edit.isPending;

  async function unlink() {
    if (submitting.current) return;
    submitting.current = true;
    setPreparing(true);
    setError("");
    try {
      await client.fetchQuery({
        ...reads.project(client, project.id),
        staleTime: 0,
      });
      await edit.mutateAsync({
        projectId: project.id,
        resolve: (current) => {
          if (current.channel_id !== channelId)
            throw new Error(
              tr(
                "This project is no longer linked to this channel. Close this dialog and review its current assignment.",
              ),
            );
          return {
            steps: [{ type: "update_project", payload: { channel_id: null } }],
          };
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparing(false);
      submitting.current = false;
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="channel-dialog-overlay" />
        <Dialog.Content
          className="channel-link-dialog"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <Dialog.Title>{tr("Unlink project")}</Dialog.Title>
          <Dialog.Description>
            {tr(
              "Unlink {{project}} from this channel? The project, timeline and media will stay intact. Existing publications and reviews will remain in the channel history.",
              { project: project.name },
            )}
          </Dialog.Description>
          {error && <p role="alert">{error}</p>}
          <div className="channel-actions">
            <Dialog.Close className="button" disabled={busy}>
              {tr("Cancel")}
            </Dialog.Close>
            <button
              className="button primary"
              disabled={busy || pendingEdits > 0}
              onClick={() => void unlink()}
            >
              {busy ? tr("Unlinking…") : tr("Confirm unlink")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
