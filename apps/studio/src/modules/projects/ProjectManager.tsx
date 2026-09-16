import { writes } from "@/api/mutations";
import { projectWrites } from "@/api/projectMutations";
import { keys } from "@/api/queries";
import ConfirmDelete from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { tr } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { ChannelSelect } from "@/modules/channels/ChannelSelect";
import { fileSize } from "@/modules/exports/RenderQueue";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Check, LoaderCircle, X } from "lucide-react";
import { useForm } from "react-hook-form";

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
  const form = useForm({
    defaultValues: {
      name: project.name,
      brief: project.brief,
      channelId: project.channel_id || "",
    },
  });
  const { name, brief, channelId } = form.watch();
  const setName = (value: string) =>
    form.setValue("name", value, { shouldDirty: true });
  const setBrief = (value: string) =>
    form.setValue("brief", value, { shouldDirty: true });
  const setChannelId = (value: string) =>
    form.setValue("channelId", value, { shouldDirty: true });
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
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <>
        <DialogContent
          showCloseButton={false}
          className="modal"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <div className="modal-title">
            <DialogTitle>{tr("Edit project")}</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="icon-button"
                aria-label={tr("Close")}
                disabled={busy}
              >
                <X size={20} />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription>
            {tr(
              "Update the name and creative brief. Your timeline and media stay in place.",
            )}
          </DialogDescription>
          <form
            className="project-edit-form"
            onSubmit={form.handleSubmit(save)}
          >
            <label className="field">
              {tr("Project name")}
              <Input
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
              <Textarea
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
              <Button
                variant="outline"
                type="button"
                className="button"
                disabled={busy}
                onClick={onClose}
              >
                {tr("Cancel")}
              </Button>
              <Button
                variant="default"
                className="button primary"
                disabled={busy || !name.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Check size={17} />
                )}
                {busy ? tr("Saving…") : tr("Save changes")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </>
    </DialogRoot>
  );
}
