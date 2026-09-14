import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  Download,
  FolderPlus,
  Globe,
  HardDrive,
  LoaderCircle,
  LockKeyhole,
  Trash2,
  X,
} from "lucide-react";
import { reads } from "./api/queries";
import { writes } from "./api/mutations";
import { tr, useLocale } from "./i18n";
import { fileSize } from "./RenderQueue";
import type { Asset } from "./types";
import TagInput from "./TagInput";
import MediaDeleteDialog from "./MediaDeleteDialog";
const metadata = (a: Asset) => ({
  name: a.name,
  tags: a.tags,
  source: a.source,
  license: a.license,
});
export default function MediaManager({
  asset,
  onClose,
  onNotice,
}: {
  asset: Asset;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  useLocale();
  const client = useQueryClient();
  const [base, setBase] = useState(asset);
  const [draft, setDraft] = useState(metadata(asset));
  const [tab, setTab] = useState<"details" | "sharing">("details");
  const [destination, setDestination] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");
  const save = useMutation(writes.assetMetadata(client));
  const locate = useMutation(writes.location(client));
  const detach = useMutation(writes.removeMediaMembership(client));
  const busy = useIsMutating() > 0;
  const usage = useQuery(reads.assetUsage(asset.id));
  const { data: projects = [] } = useQuery(reads.projects(client));
  const { data: folders = [] } = useQuery(reads.folders(client));
  const dirty = JSON.stringify(draft) !== JSON.stringify(metadata(base));
  useEffect(() => {
    if (
      !dirty ||
      JSON.stringify(metadata(asset)) === JSON.stringify(metadata(base))
    ) {
      if (!dirty) setDraft(metadata(asset));
      setBase(asset);
    }
  }, [asset, base, dirty]);
  async function submit() {
    try {
      const result = await save.mutateAsync({
        assetId: asset.id,
        request: { ...draft, expected_version: base.version },
      });
      setBase(result);
      setDraft(metadata(result));
      setMessage(tr("Media details saved."));
    } catch {
      /* Preserve the draft on conflict. */
    }
  }
  async function reload() {
    try {
      const list = await client.fetchQuery({
        ...reads.inventory(client),
        staleTime: 0,
      });
      const latest = list.find((a) => a.id === asset.id);
      if (latest) {
        setBase(latest);
        setDraft(metadata(latest));
        save.reset();
        setLocalError("");
      } else onClose();
    } catch (e) {
      setLocalError((e as Error).message);
    }
  }
  async function location(project_id?: string, folder_id?: string) {
    try {
      await locate.mutateAsync({
        assetId: asset.id,
        destination: { project_id, folder_id },
      });
      setMessage(tr("Collection updated."));
      setDestination("");
    } catch {
      /* Visible below. */
    }
  }
  async function removeMembership(project_id?: string) {
    try {
      await detach.mutateAsync({
        assetId: asset.id,
        request: { project_id, expected_version: asset.version },
      });
      setMessage(tr("Membership removed. The original file is kept."));
    } catch {
      /* Visible below. */
    }
  }
  const shared = Object.hasOwn(asset.locations, "library");
  const memberships = Object.keys(asset.locations).filter(
    (id) => id !== "library",
  );
  const used = usage.data?.projects || [];
  const canUnshare = memberships.length > 0 || used.length > 0;
  const error = save.error || locate.error || detach.error || usage.error;
  return (
    <>
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open && !busy && !deleting) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content
            className="modal media-manager"
            onEscapeKeyDown={(e) => {
              if (busy || deleting) e.preventDefault();
            }}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <div className="modal-title">
              <div>
                <Dialog.Title>{tr("Manage media")}</Dialog.Title>
                <Dialog.Description>
                  {tr(
                    "One source file. Shared details across your collections.",
                  )}
                </Dialog.Description>
              </div>
              <button
                className="icon-button"
                aria-label={tr("Close")}
                onClick={onClose}
                disabled={busy || deleting}
              >
                <X size={20} />
              </button>
            </div>
            <div className="media-manager-layout">
              <div className="media-manager-preview">
                <div className="media-original">
                  {asset.kind === "image" ? (
                    <img src={asset.url} alt={asset.name} />
                  ) : asset.kind === "video" ? (
                    <video
                      controls
                      preload="metadata"
                      src={asset.url}
                      poster={asset.thumbnail_url || undefined}
                      aria-label={tr("Media preview")}
                    />
                  ) : (
                    <div className="media-audio-preview">
                      <HardDrive size={40} />
                      <audio
                        controls
                        preload="metadata"
                        src={asset.url}
                        aria-label={tr("Media preview")}
                      />
                    </div>
                  )}
                </div>
                <div className="media-file-info">
                  <strong>{asset.name}</strong>
                  <div>
                    <span>{asset.kind.toUpperCase()}</span>
                    <span>{fileSize(asset.size)}</span>
                    {asset.duration_ms ? (
                      <span>
                        {asset.duration_ms < 1000
                          ? `${asset.duration_ms} ms`
                          : `${(asset.duration_ms / 1000).toFixed(1)} s`}
                      </span>
                    ) : null}
                    {asset.width && (
                      <span>
                        {asset.width} × {asset.height}
                      </span>
                    )}
                  </div>
                  <a href={asset.url} download className="button">
                    <Download size={15} />
                    {tr("Download original")}
                  </a>
                </div>
              </div>
              <div className="media-manager-details">
                <div
                  role="tablist"
                  aria-label={tr("Media settings")}
                  className="media-settings-tabs"
                >
                  <button
                    role="tab"
                    aria-selected={tab === "details"}
                    onClick={() => setTab("details")}
                  >
                    {tr("Details & tags")}
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "sharing"}
                    onClick={() => setTab("sharing")}
                  >
                    {tr("Sharing & usage")}
                  </button>
                </div>
                {(error || localError) && (
                  <div role="alert" className="error-banner">
                    {localError || error?.message}
                    <button
                      className="text-button"
                      onClick={() => void reload()}
                      disabled={busy}
                    >
                      {tr("Reload latest details")}
                    </button>
                  </div>
                )}
                {message && (
                  <p role="status" className="media-feedback">
                    {message}
                  </p>
                )}
                {tab === "details" ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    <label className="field">
                      {tr("Media name")}
                      <input
                        value={draft.name}
                        required
                        maxLength={300}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                      />
                    </label>
                    <div className="field">
                      <span>{tr("Tags")}</span>
                      <TagInput
                        tags={draft.tags}
                        disabled={busy}
                        onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
                      />
                    </div>
                    <label className="field">
                      {tr("Source / attribution")}
                      <input
                        value={draft.source}
                        maxLength={5000}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft({ ...draft, source: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      {tr("License")}
                      <input
                        value={draft.license}
                        maxLength={2000}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft({ ...draft, license: e.target.value })
                        }
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={busy || !dirty || !draft.name.trim()}
                    >
                      {save.isPending ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      {save.isPending ? tr("Saving…") : tr("Save details")}
                    </button>
                  </form>
                ) : (
                  <div className="media-sharing">
                    <div className="media-sharing-card">
                      <div>
                        {shared ? (
                          <Globe size={18} />
                        ) : (
                          <LockKeyhole size={18} />
                        )}
                        <strong>
                          {shared ? tr("Shared library") : tr("Private media")}
                        </strong>
                      </div>
                      <p>
                        {shared
                          ? tr("Available to reuse in every project.")
                          : tr(
                              "This file is not listed in the shared library.",
                            )}
                      </p>
                      {shared ? (
                        <>
                          <label className="field">
                            {tr("Shared folder")}
                            <select
                              value={asset.locations.library || ""}
                              disabled={busy}
                              onChange={(e) =>
                                void location(
                                  undefined,
                                  e.target.value || undefined,
                                )
                              }
                            >
                              <option value="">{tr("Collection root")}</option>
                              {folders.map((f) => (
                                <option
                                  key={f.id}
                                  value={f.id}
                                  disabled={f.id.startsWith("pending:")}
                                >
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="button"
                            disabled={
                              busy ||
                              usage.isPending ||
                              !!usage.error ||
                              !canUnshare
                            }
                            onClick={() => void removeMembership()}
                          >
                            {tr("Remove from shared library")}
                          </button>
                          {!canUnshare && (
                            <small>
                              {tr(
                                "This unused file has no other collection. Use Delete from disk to remove it completely.",
                              )}
                            </small>
                          )}
                        </>
                      ) : (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => void location()}
                        >
                          <Globe size={15} />
                          {tr("Share to library")}
                        </button>
                      )}
                    </div>
                    <div className="media-sharing-card">
                      <strong>{tr("Project collections")}</strong>
                      {memberships.map((id) => (
                        <div className="media-membership" key={id}>
                          <span>
                            {projects.find((p) => p.id === id)?.name || id}
                            {used.some(
                              (u) => u.project_id === id && u.current,
                            ) && <small>{tr("Used in current project")}</small>}
                          </span>
                          <button
                            className="icon-button"
                            aria-label={tr("Remove from {{name}}", {
                              name:
                                projects.find((p) => p.id === id)?.name || id,
                            })}
                            disabled={
                              busy ||
                              usage.isPending ||
                              !!usage.error ||
                              used.some((u) => u.project_id === id && u.current)
                            }
                            onClick={() => void removeMembership(id)}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <div className="media-add-project">
                        <select
                          aria-label={tr("Add to project")}
                          value={destination}
                          onChange={(e) => setDestination(e.target.value)}
                          disabled={busy}
                        >
                          <option value="">{tr("Choose a project…")}</option>
                          {projects
                            .filter(
                              (p) =>
                                !memberships.includes(p.id) &&
                                !p.id.startsWith("pending:"),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                        <button
                          className="button"
                          disabled={!destination || busy}
                          onClick={() => void location(destination)}
                        >
                          <FolderPlus size={15} />
                          {tr("Add")}
                        </button>
                      </div>
                    </div>
                    <div className="media-sharing-card">
                      <strong>{tr("Where this file is used")}</strong>
                      {usage.isPending ? (
                        <p>{tr("Checking project references…")}</p>
                      ) : usage.error ? (
                        <p>
                          {tr(
                            "Usage could not be verified. Retry before deleting this file.",
                          )}
                        </p>
                      ) : used.length ? (
                        used.map((u) => (
                          <div className="media-usage" key={u.project_id}>
                            <a href={`#/projects/${u.project_id}`}>{u.name}</a>
                            <small>
                              {u.current
                                ? tr("Used in current project")
                                : tr("Kept for project history")}
                              {tr(
                                " · Revisions: {{revisions}} · Exports: {{jobs}}",
                                {
                                  revisions: u.revisions.length,
                                  jobs: u.job_ids.length,
                                },
                              )}
                            </small>
                          </div>
                        ))
                      ) : (
                        <p>
                          {tr(
                            "No project, history or export references. Safe to delete from disk.",
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="media-delete-zone">
                  <button
                    className="button danger-outline"
                    disabled={busy || !usage.data?.can_delete || !!usage.error}
                    onClick={() => setDeleting(true)}
                  >
                    <Trash2 size={15} />
                    {tr("Delete from disk")}
                  </button>
                  <small>
                    {usage.data && !usage.data.can_delete
                      ? tr(
                          "Protected by project references. Open Sharing & usage for details; unshare it to hide it from the library.",
                        )
                      : tr(
                          "Permanently removes the original and thumbnail from all collections.",
                        )}
                  </small>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {deleting && (
        <MediaDeleteDialog
          assets={[asset]}
          onClose={() => setDeleting(false)}
          onDone={(message) => {
            onNotice(message);
            onClose();
          }}
        />
      )}
    </>
  );
}
