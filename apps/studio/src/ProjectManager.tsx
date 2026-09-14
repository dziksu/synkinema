import { useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, LoaderCircle, X } from "lucide-react";
import { tr } from "./i18n";
import { writes } from "./api/mutations";
import { keys } from "./api/queries";
import { projectWrites } from "./api/projectMutations";
import type { Project } from "./types";
import ConfirmDelete from "./ConfirmDelete";
import { fileSize } from "./RenderQueue";
import { ChannelSelect } from "./Channels";

export default function ProjectManager({
  project,
  mode,
  onClose,
  onDeleted,
}: {
  project: Project;
  mode: "edit" | "delete";
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(project.name);
  const [brief, setBrief] = useState(project.brief);
  const [channelId, setChannelId] = useState(project.channel_id || "");
  const edit = useMutation(projectWrites(client));
  const deletion = useMutation(writes.deleteProject(client));
  const pendingEdits = useIsMutating({ mutationKey: ["project-edit"] });
  const busy = edit.isPending || deletion.isPending;
  async function save() {
    // The revision shown when opening the form is its editing base. The backend
    // and editor queue both protect it from overwriting newer concurrent edits.
    if (!client.getQueryData(keys.project(project.id)))
      client.setQueryData(keys.project(project.id), project);
    try {
      await edit.mutateAsync({
        projectId: project.id,
        resolve: (current) => {
          if (current.revision !== project.revision)
            throw new Error(
              tr(
                "This project changed. Close this dialog and reopen it to review the latest version.",
              ),
            );
          return {
            steps: [
              {
                type: "update_project",
                payload: {
                  name: name.trim(),
                  brief,
                  channel_id: channelId || null,
                },
              },
            ],
          };
        },
      });
      onClose();
    } catch {
      /* Show the mutation error in the form without losing the draft. */
    }
  }
  async function remove() {
    try {
      const result = await deletion.mutateAsync(project);
      onDeleted(
        result.pending_files
          ? tr(
              "Project deleted. Some files still need disk cleanup; check Render queue.",
            )
          : tr("Project deleted · {{size}} freed on disk.", {
              size: fileSize(result.freed_bytes),
            }),
      );
      onClose();
    } catch {
      /* Keep confirmation and display the conflict/transport error. */
    }
  }
  if (mode === "delete")
    return (
      <ConfirmDelete
        title={tr("Delete project permanently?")}
        pending={deletion.isPending}
        error={
          deletion.error?.message ||
          (pendingEdits
            ? tr("Wait for project changes to finish saving.")
            : undefined)
        }
        onClose={onClose}
        onConfirm={() => {
          if (!pendingEdits) void remove();
        }}
      >
        <p className="deletion-project-name">{project.name}</p>
        <p>
          {tr(
            "This deletes the project, its entire history, comments, exports and private folders. Running renders will be stopped.",
          )}
        </p>
        <p>
          {tr(
            "Export files, previews and exclusive private media will be physically removed from disk. Shared library media and sources used by other projects or their history are kept.",
          )}
        </p>
        <p>
          <strong>{tr("This cannot be undone.")}</strong>
        </p>
      </ConfirmDelete>
    );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <div className="modal-title">
            <Dialog.Title>{tr("Edit project")}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                aria-label={tr("Close")}
                disabled={busy}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description>
            {tr(
              "Update the name and creative brief. Your timeline and media stay in place.",
            )}
          </Dialog.Description>
          <form
            className="project-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field">
              {tr("Project name")}
              <input
                required
                maxLength={200}
                autoFocus
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              {tr("Creative brief")}
              <textarea
                maxLength={20000}
                rows={5}
                value={brief}
                disabled={busy}
                onChange={(e) => setBrief(e.target.value)}
              />
            </label>
            {edit.error && (
              <p role="alert" className="error-banner">
                {edit.error.message}
              </p>
            )}
            <ChannelSelect
              value={channelId}
              onChange={setChannelId}
              disabled={busy}
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={onClose}
              >
                {tr("Cancel")}
              </button>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Check size={17} />
                )}
                {busy ? tr("Saving…") : tr("Save changes")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
