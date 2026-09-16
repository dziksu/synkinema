import { RouteTabs } from "@/components/route-tabs";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { writes } from "@/api/mutations";
import { reads } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useFormDraft } from "@/hooks/use-form-draft";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset } from "@/lib/types";
import { fileSize } from "@/modules/exports/RenderQueue";
import MediaDeleteDialog from "@/modules/media/MediaDeleteDialog";
import TagInput from "@/modules/media/TagInput";
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
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
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
  const [draft, setDraft, form] = useFormDraft(metadata(asset));
  const { search } = useWorkspaceNavigation();
  const tab = search.mediaTab ?? "details";
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
      <DialogRoot
        open
        onOpenChange={(open) => {
          if (!open && !busy && !deleting) onClose();
        }}
      >
        <>
          <DialogContent
            showCloseButton={false}
            className="modal media-manager flex flex-col overflow-hidden"
            onEscapeKeyDown={(e) => {
              if (busy || deleting) e.preventDefault();
            }}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <div className="modal-title">
              <div>
                <DialogTitle>{tr("Manage media")}</DialogTitle>
                <DialogDescription>
                  {tr(
                    "One source file. Shared details across your collections.",
                  )}
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="icon-button"
                aria-label={tr("Close")}
                onClick={onClose}
                disabled={busy || deleting}
              >
                <X size={20} />
              </Button>
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
                <RouteTabs
                  label={tr("Media settings")}
                  value={tab}
                  className="mb-5 border-b border-border"
                  items={[
                    {
                      value: "details",
                      label: tr("Details & tags"),
                      search: { mediaTab: undefined },
                    },
                    {
                      value: "sharing",
                      label: tr("Sharing & usage"),
                      search: { mediaTab: "sharing" },
                    },
                  ]}
                />
                {(error || localError) && (
                  <div role="alert" className="error-banner">
                    {localError || error?.message}
                    <Button
                      variant="ghost"
                      className="text-button"
                      onClick={() => void reload()}
                      disabled={busy}
                    >
                      {tr("Reload latest details")}
                    </Button>
                  </div>
                )}
                {message && (
                  <p role="status" className="media-feedback">
                    {message}
                  </p>
                )}
                {tab === "details" ? (
                  <form onSubmit={form.handleSubmit(submit)}>
                    <label className="field">
                      {tr("Media name")}
                      <Input
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
                      <Input
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
                      <Input
                        value={draft.license}
                        maxLength={2000}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft({ ...draft, license: e.target.value })
                        }
                      />
                    </label>
                    <Button
                      variant="default"
                      className="button primary"
                      disabled={busy || !dirty || !draft.name.trim()}
                    >
                      {save.isPending ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      {save.isPending ? tr("Saving…") : tr("Save details")}
                    </Button>
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
                            <NativeSelect
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
                            </NativeSelect>
                          </label>
                          <Button
                            variant="outline"
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
                          </Button>
                          {!canUnshare && (
                            <small>
                              {tr(
                                "This unused file has no other collection. Use Delete from disk to remove it completely.",
                              )}
                            </small>
                          )}
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          className="button"
                          disabled={busy}
                          onClick={() => void location()}
                        >
                          <Globe size={15} />
                          {tr("Share to library")}
                        </Button>
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
                          <Button
                            variant="ghost"
                            size="icon-sm"
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
                          </Button>
                        </div>
                      ))}
                      <div className="media-add-project">
                        <NativeSelect
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
                        </NativeSelect>
                        <Button
                          variant="outline"
                          className="button"
                          disabled={!destination || busy}
                          onClick={() => void location(destination)}
                        >
                          <FolderPlus size={15} />
                          {tr("Add")}
                        </Button>
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
                            <Link
                              to="/projects/$projectId"
                              params={{ projectId: u.project_id }}
                            >
                              {u.name}
                            </Link>
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
                  <Button
                    variant="destructive"
                    className="button danger-outline"
                    disabled={busy || !usage.data?.can_delete || !!usage.error}
                    onClick={() => setDeleting(true)}
                  >
                    <Trash2 size={15} />
                    {tr("Delete from disk")}
                  </Button>
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
          </DialogContent>
        </>
      </DialogRoot>
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
