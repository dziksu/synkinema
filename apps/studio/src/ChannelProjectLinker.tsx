import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { X } from "lucide-react";
import { reads } from "./api/queries";
import { projectWrites } from "./api/projectMutations";
import type { Channel, ProjectSnapshot } from "./api/generated/client";
import { tr } from "./i18n";

export default function ChannelProjectLinker({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const projects = useQuery(reads.projects(client));
  const edit = useMutation(projectWrites(client));
  const pendingEdits = useIsMutating({ mutationKey: ["project-edit"] });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProjectSnapshot | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const busy = preparing || edit.isPending;
  const candidates = (projects.data || []).filter(
    (p) =>
      p.channel_id !== channel.id &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  async function link() {
    if (!selected) return;
    setPreparing(true);
    setError("");
    try {
      const current = await client.fetchQuery({
        ...reads.project(client, selected.id),
        staleTime: 0,
      });
      if (current.channel_id !== selected.channel_id) {
        setSelected(current);
        throw new Error(
          tr("The project assignment changed. Review it and confirm again."),
        );
      }
      await edit.mutateAsync({
        projectId: selected.id,
        resolve: (latest) => {
          if (latest.channel_id !== current.channel_id)
            throw new Error(
              tr(
                "The project assignment changed. Review it and confirm again.",
              ),
            );
          return {
            steps: [
              { type: "update_project", payload: { channel_id: channel.id } },
            ],
          };
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparing(false);
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
          <header>
            <Dialog.Title>{tr("Link existing project")}</Dialog.Title>
            <Dialog.Close
              className="icon-button"
              disabled={busy}
              aria-label={tr("Close")}
            >
              <X size={18} />
            </Dialog.Close>
          </header>
          <Dialog.Description>
            {tr(
              "Choose a project for {{channel}}. Its timeline and media will stay unchanged.",
              { channel: channel.name },
            )}
          </Dialog.Description>
          <label className="field">
            {tr("Search projects")}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Search projects")}
              disabled={busy}
            />
          </label>
          {projects.isPending && <p>{tr("Loading…")}</p>}
          {projects.error && (
            <div role="alert">
              <p>{projects.error.message}</p>
              <button
                className="button"
                onClick={() => void projects.refetch()}
              >
                {tr("Try again")}
              </button>
            </div>
          )}
          <div
            className="channel-project-options"
            role="group"
            aria-label={tr("Available projects")}
          >
            {candidates.map((p) => (
              <button
                className="channel-project-option"
                key={p.id}
                aria-pressed={selected?.id === p.id}
                disabled={busy}
                onClick={() => {
                  setSelected(p);
                  setError("");
                }}
              >
                <strong>{p.name}</strong>
                <span>
                  {p.channel_id
                    ? tr("Currently linked to {{channel}}", {
                        channel:
                          p.channel_context?.channel.name || p.channel_id,
                      })
                    : tr("Independent project (no channel)")}
                </span>
              </button>
            ))}
            {!projects.isPending && !projects.error && !candidates.length && (
              <p>{tr("No matching unlinked projects")}</p>
            )}
          </div>
          {selected && (
            <div className="channel-link-confirm">
              <strong>{selected.name}</strong>
              <p>
                {selected.channel_id && selected.channel_id !== channel.id
                  ? tr(
                      "This project will move from {{source}} to {{target}}. It can belong to only one channel.",
                      {
                        source:
                          selected.channel_context?.channel.name ||
                          selected.channel_id,
                        target: channel.name,
                      },
                    )
                  : tr("This project will use the rules of {{channel}}.", {
                      channel: channel.name,
                    })}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          <footer className="dialog-actions">
            <button className="button" disabled={busy} onClick={onClose}>
              {tr("Cancel")}
            </button>
            <button
              className="button primary"
              disabled={
                !selected ||
                busy ||
                pendingEdits > 0 ||
                selected.channel_id === channel.id
              }
              onClick={() => void link()}
            >
              {busy
                ? tr("Saving…")
                : selected?.channel_id
                  ? tr("Move project to this channel")
                  : tr("Link project")}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
