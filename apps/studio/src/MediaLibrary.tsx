import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  Check,
  Folder,
  FolderPlus,
  Globe,
  HardDrive,
  Image,
  LockKeyhole,
  Music2,
  Pencil,
  Play,
  Square,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import AgentPromptCopyButton from "./AgentPromptCopyButton";
import { sharedLibraryAgentPrompt } from "./agentPrompts";
import { reads } from "./api/queries";
import { writes } from "./api/mutations";
import { tr, useLocale } from "./i18n";
import type { Asset } from "./types";
import type { AssetBatchUpdate } from "./api/generated/client";
import type { MediaDestination } from "./MediaBrowser";
import MediaManager from "./MediaManager";
import MediaDeleteDialog from "./MediaDeleteDialog";
import TagInput from "./TagInput";
import { fileSize } from "./RenderQueue";
export default function MediaLibrary({
  onDestination,
  onNotice,
}: {
  onDestination: (d: MediaDestination) => void;
  onNotice: (message: string) => void;
}) {
  useLocale();
  const client = useQueryClient();
  const inventory = useQuery(reads.inventory(client));
  const folders = useQuery(reads.folders(client));
  const [view, setView] = useState("shared");
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [managed, setManaged] = useState<Asset>();
  const [quickPreviewId, setQuickPreviewId] = useState<string>();
  const [quickPreviewPositionMs, setQuickPreviewPositionMs] = useState(0);
  const [quickPreviewError, setQuickPreviewError] = useState("");
  const quickPreviewAudio = useRef<HTMLAudioElement>(null);
  const [deleting, setDeleting] = useState<Asset[]>();
  const [folderDialog, setFolderDialog] = useState<{
    id?: string;
    mode: "edit" | "delete";
    name: string;
  }>();
  const [batchDialog, setBatchDialog] = useState<
    "add_tags" | "remove_tags" | "locate"
  >();
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchFolder, setBatchFolder] = useState("");
  const [notice, setNotice] = useState("");
  const [dropTarget, setDropTarget] = useState<string>();
  const batch = useMutation(writes.mediaBatch(client));
  const saveFolder = useMutation(writes.folder(client));
  const deleteFolder = useMutation(writes.deleteFolder(client));
  const busy = useIsMutating() > 0;
  const assets = inventory.data || [];
  const shared = assets.filter((a) => "library" in a.locations);
  const tags = [...new Set(assets.flatMap((a) => a.tags))].sort();
  const chosen = assets.filter((a) => selected.includes(a.id));
  const filtered = assets
    .filter(
      (a) =>
        (view === "all" ||
          (view === "private"
            ? !("library" in a.locations)
            : "library" in a.locations)) &&
        (!folder || a.locations.library === folder) &&
        (kind === "all" || a.kind === kind) &&
        (!tagFilter || a.tags.includes(tagFilter)) &&
        `${a.name} ${a.tags.join(" ")}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "size"
          ? b.size - a.size
          : b.created_at.localeCompare(a.created_at),
    );
  useEffect(() => {
    onDestination({
      folder_id: view === "shared" ? folder || undefined : undefined,
    });
  }, [onDestination, view, folder]);
  const switchView = (next: string, folderId = "") => {
    setView(next);
    setFolder(folderId);
    setSelected([]);
  };
  const announce = (message: string) => {
    setNotice(message);
    onNotice(message);
  };
  async function changeBatch(request: AssetBatchUpdate) {
    try {
      await batch.mutateAsync(request);
      setBatchDialog(undefined);
      setSelected([]);
      setNotice(
        tr("Updated {{count}} media files.", {
          count: request.asset_ids.length,
        }),
      );
    } catch {
      /* Mutation error remains visible. */
    }
  }
  function drop(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    setDropTarget(undefined);
    const id = e.dataTransfer.getData("application/synkinema-asset");
    if (!id || busy) return;
    const ids = chosen.some((a) => a.id === id)
      ? chosen.map((a) => a.id)
      : [id];
    void changeBatch({
      asset_ids: ids,
      action: "locate",
      destination: { folder_id: folderId || undefined },
    });
  }
  const dropProps = (id: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (
        e.dataTransfer.types.includes("application/synkinema-asset") &&
        !busy
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropTarget(id);
      }
    },
    onDragLeave: () => setDropTarget(undefined),
    onDrop: (e: React.DragEvent) => drop(e, id),
  });
  const error = inventory.error || folders.error || batch.error;
  return (
    <div className="media-library-workspace">
      <aside className="media-library-nav">
        <span className="eyebrow">{tr("COLLECTIONS")}</span>
        <button
          className={view === "shared" && !folder ? "selected" : ""}
          onClick={() => switchView("shared")}
          {...dropProps("")}
          data-dropping={dropTarget === ""}
        >
          <Globe size={16} />
          <span>{tr("Shared library")}</span>
          <small>{shared.length}</small>
        </button>
        <button
          className={view === "all" ? "selected" : ""}
          onClick={() => switchView("all")}
        >
          <HardDrive size={16} />
          <span>{tr("All stored media")}</span>
          <small>{assets.length}</small>
        </button>
        <button
          className={view === "private" ? "selected" : ""}
          onClick={() => switchView("private")}
        >
          <LockKeyhole size={16} />
          <span>{tr("Private media")}</span>
          <small>{assets.length - shared.length}</small>
        </button>
        <div className="media-nav-heading">
          <span className="eyebrow">{tr("SHARED FOLDERS")}</span>
          <button
            className="icon-button"
            aria-label={tr("New folder")}
            onClick={() => {
              saveFolder.reset();
              setFolderDialog({ mode: "edit", name: "" });
            }}
          >
            <FolderPlus size={16} />
          </button>
        </div>
        {(folders.data || []).map((f) => (
          <button
            key={f.id}
            className={view === "shared" && folder === f.id ? "selected" : ""}
            disabled={f.id.startsWith("pending:")}
            onClick={() => switchView("shared", f.id)}
            {...dropProps(f.id)}
            data-dropping={dropTarget === f.id}
          >
            <Folder size={15} />
            <span>{f.name}</span>
            <small>
              {shared.filter((a) => a.locations.library === f.id).length}
            </small>
          </button>
        ))}
        <p>
          {tr(
            "Drag files onto a shared folder to organize or share them. Originals are stored once.",
          )}
        </p>
      </aside>
      <section className="media-library-content">
        <div className="media-library-heading">
          <div>
            <h2>
              {folder
                ? folders.data?.find((f) => f.id === folder)?.name
                : view === "all"
                  ? tr("All stored media")
                  : view === "private"
                    ? tr("Private media")
                    : tr("Shared library")}
            </h2>
            <p>
              {view === "shared"
                ? tr("Reusable sources, organized for your next edit.")
                : tr(
                    "Local storage inventory. Viewing private files does not share them.",
                  )}
            </p>
          </div>
          <div className="media-library-heading-actions">
            {view === "shared" && (
              <AgentPromptCopyButton
                prompt={sharedLibraryAgentPrompt(
                  folder
                    ? (folders.data || []).find((item) => item.id === folder)
                    : undefined,
                )}
                onNotice={announce}
                label={tr("Copy library agent prompt")}
              />
            )}
            {folder && (
              <div>
                <button
                  className="icon-button"
                  aria-label={tr("Rename folder")}
                  onClick={() => {
                    saveFolder.reset();
                    setFolderDialog({
                      id: folder,
                      mode: "edit",
                      name:
                        folders.data?.find((f) => f.id === folder)?.name || "",
                    });
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button danger-text"
                  aria-label={tr("Delete folder")}
                  onClick={() => {
                    deleteFolder.reset();
                    setFolderDialog({
                      id: folder,
                      mode: "delete",
                      name:
                        folders.data?.find((f) => f.id === folder)?.name || "",
                    });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="media-library-filters">
          <label className="media-library-search">
            <Search size={16} />
            <input
              aria-label={tr("Search media")}
              placeholder={tr("Search names or tags…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label={tr("Media type")}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">{tr("All types")}</option>
            <option value="image">{tr("Images")}</option>
            <option value="video">{tr("Video")}</option>
            <option value="audio">{tr("Audio")}</option>
          </select>
          <select
            aria-label={tr("Filter by tag")}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">{tr("All tags")}</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="media-sort">
            <ArrowDownWideNarrow size={15} />
            <select
              aria-label={tr("Sort media")}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">{tr("Newest first")}</option>
              <option value="name">{tr("Name")}</option>
              <option value="size">{tr("Largest first")}</option>
            </select>
          </label>
        </div>
        {notice && (
          <p role="status" className="media-feedback">
            {notice}
          </p>
        )}
        {error && (
          <div role="alert" className="error-banner">
            {error.message}
            <button
              className="text-button"
              onClick={() => {
                void inventory.refetch();
                void folders.refetch();
                batch.reset();
              }}
            >
              {tr("Try again")}
            </button>
          </div>
        )}
        <div className="media-selection-bar">
          <label>
            <input
              type="checkbox"
              aria-label={tr("Select visible media")}
              disabled={!filtered.length || busy}
              checked={
                filtered.length > 0 &&
                filtered.every((a) => selected.includes(a.id))
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [
                        ...new Set([...selected, ...filtered.map((a) => a.id)]),
                      ].slice(0, 100)
                    : selected.filter(
                        (id) => !filtered.some((a) => a.id === id),
                      ),
                )
              }
            />
            {chosen.length
              ? tr("{{count}} selected", { count: chosen.length })
              : tr("{{count}} media files", { count: filtered.length })}
          </label>
          {chosen.length > 0 && (
            <div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  batch.reset();
                  setBatchTags([]);
                  setBatchDialog("add_tags");
                }}
              >
                <Tag size={14} />
                {tr("Edit tags")}
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  batch.reset();
                  setBatchFolder(folder);
                  setBatchDialog("locate");
                }}
              >
                <Folder size={14} />
                {tr("Move / share")}
              </button>
              <button
                className="text-button danger-text"
                disabled={busy}
                onClick={() => setDeleting(chosen)}
              >
                <Trash2 size={14} />
                {tr("Delete from disk")}
              </button>
              <button
                className="icon-button"
                aria-label={tr("Clear selection")}
                onClick={() => setSelected([])}
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>
        {inventory.isPending ? (
          <div className="empty">
            <HardDrive size={34} />
            <p>{tr("Loading media…")}</p>
          </div>
        ) : (
          <div className="media-library-grid">
            {filtered.map((a) => (
              <article
                key={a.id}
                className={`media-tile ${selected.includes(a.id) ? "selected" : ""}`}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/synkinema-asset", a.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <div className="media-tile-preview">
                  <button
                    className="media-tile-open"
                    aria-label={tr("Preview and manage {{name}}", {
                      name: a.name,
                    })}
                    onClick={() => setManaged(a)}
                  >
                    {a.thumbnail_url ? (
                      <img
                        src={a.thumbnail_url}
                        alt=""
                        draggable={false}
                        loading="lazy"
                      />
                    ) : a.kind === "audio" ? (
                      <Music2 size={35} />
                    ) : a.kind === "video" ? (
                      <Play size={35} />
                    ) : (
                      <Image size={35} />
                    )}
                  </button>
                  {a.kind !== "image" &&
                    !(quickPreviewId === a.id && a.kind === "audio") && (
                      <button
                        className="media-tile-quick-preview"
                        aria-label={
                          quickPreviewId === a.id
                            ? tr("Stop quick preview {{name}}", {
                                name: a.name,
                              })
                            : tr("Play quick preview {{name}}", {
                                name: a.name,
                              })
                        }
                        aria-pressed={quickPreviewId === a.id}
                        onClick={() => {
                          setQuickPreviewError("");
                          setQuickPreviewPositionMs(0);
                          setQuickPreviewId((id) =>
                            id === a.id ? undefined : a.id,
                          );
                        }}
                      >
                        {quickPreviewId === a.id ? (
                          <Square size={14} fill="currentColor" />
                        ) : (
                          <Play size={16} fill="currentColor" />
                        )}
                      </button>
                    )}
                  {quickPreviewId === a.id && a.kind === "video" && (
                    <video
                      className="media-tile-player"
                      autoPlay
                      controls
                      playsInline
                      preload="metadata"
                      src={a.url}
                      poster={a.thumbnail_url || undefined}
                      aria-label={tr("Quick preview {{name}}", {
                        name: a.name,
                      })}
                      onError={() =>
                        setQuickPreviewError(
                          tr(
                            "Unable to load the media preview. Check the file in the library.",
                          ),
                        )
                      }
                    />
                  )}
                  {quickPreviewId === a.id && a.kind === "audio" && (
                    <>
                      <audio
                        className="media-tile-audio-element"
                        ref={quickPreviewAudio}
                        autoPlay
                        preload="metadata"
                        src={a.url}
                        aria-label={tr("Quick preview {{name}}", {
                          name: a.name,
                        })}
                        onTimeUpdate={(e) =>
                          setQuickPreviewPositionMs(
                            Math.round(e.currentTarget.currentTime * 1000),
                          )
                        }
                        onEnded={() => {
                          setQuickPreviewId(undefined);
                          setQuickPreviewPositionMs(0);
                        }}
                        onError={() =>
                          setQuickPreviewError(
                            tr(
                              "Unable to load the media preview. Check the file in the library.",
                            ),
                          )
                        }
                      />
                      <div className="media-tile-audio-status">
                        <div>
                          <button
                            className="media-tile-audio-stop"
                            aria-label={tr("Stop quick preview {{name}}", {
                              name: a.name,
                            })}
                            onClick={() => {
                              setQuickPreviewId(undefined);
                              setQuickPreviewPositionMs(0);
                            }}
                          >
                            <Square size={11} fill="currentColor" />
                            {tr("Stop")}
                          </button>
                          <span
                            role="status"
                            aria-label={tr("Playing audio preview")}
                          >
                            {tr("Playing audio preview")}
                          </span>
                          <output>
                            {(quickPreviewPositionMs / 1000).toFixed(1)} /{" "}
                            {((a.duration_ms || 0) / 1000).toFixed(1)} s
                          </output>
                        </div>
                        <input
                          className="media-tile-audio-progress"
                          aria-label={tr("Seek audio preview")}
                          type="range"
                          min={0}
                          max={a.duration_ms || 0}
                          value={Math.min(
                            quickPreviewPositionMs,
                            a.duration_ms || 0,
                          )}
                          disabled={!a.duration_ms}
                          onChange={(e) => {
                            const positionMs = Number(e.target.value);
                            const player = quickPreviewAudio.current;
                            if (player) player.currentTime = positionMs / 1000;
                            setQuickPreviewPositionMs(positionMs);
                          }}
                        />
                      </div>
                    </>
                  )}
                  {quickPreviewId === a.id && quickPreviewError && (
                    <p className="media-tile-preview-error" role="alert">
                      {quickPreviewError}
                    </p>
                  )}
                  <input
                    type="checkbox"
                    aria-label={tr("Select media {{name}}", { name: a.name })}
                    disabled={
                      busy || (!selected.includes(a.id) && chosen.length >= 100)
                    }
                    checked={selected.includes(a.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, a.id]
                          : selected.filter((id) => id !== a.id),
                      )
                    }
                  />
                  <span className="media-visibility">
                    {"library" in a.locations ? (
                      <Globe size={12} />
                    ) : (
                      <LockKeyhole size={12} />
                    )}
                    {"library" in a.locations ? tr("Shared") : tr("Private")}
                  </span>
                  <span className="media-tile-duration">
                    {a.duration_ms
                      ? a.duration_ms < 1000
                        ? `${a.duration_ms} ms`
                        : `${(a.duration_ms / 1000).toFixed(1)} s`
                      : tr("Image")}
                  </span>
                </div>
                <div className="media-tile-body">
                  <button
                    className="media-tile-name"
                    onClick={() => setManaged(a)}
                    title={a.name}
                  >
                    {a.name}
                  </button>
                  <small>
                    {a.kind.toUpperCase()} · {fileSize(a.size)}
                  </small>
                  <div className="media-tile-tags">
                    {a.tags.slice(0, 3).map((tag) => (
                      <button key={tag} onClick={() => setTagFilter(tag)}>
                        {tag}
                      </button>
                    ))}
                    {!a.tags.length && <span>{tr("No tags yet")}</span>}
                    {a.tags.length > 3 && (
                      <span>
                        {tr("+{{count}}", { count: a.tags.length - 3 })}
                      </span>
                    )}
                  </div>
                  <button
                    className="media-manage-button"
                    onClick={() => setManaged(a)}
                    aria-label={tr("Manage {{name}}", { name: a.name })}
                  >
                    <SlidersHorizontal size={14} />
                    {tr("Manage media")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {!inventory.isPending && !filtered.length && (
          <div className="empty">
            <Folder size={40} />
            <h3>{tr("No media in this view")}</h3>
            <p>
              {tr("Import files or adjust the collection, search and filters.")}
            </p>
            <button
              className="button"
              onClick={() => {
                setSearch("");
                setKind("all");
                setTagFilter("");
              }}
            >
              {tr("Reset filters")}
            </button>
          </div>
        )}
      </section>
      {managed && (
        <MediaManager
          key={managed.id}
          asset={assets.find((a) => a.id === managed.id) || managed}
          onClose={() => setManaged(undefined)}
          onNotice={announce}
        />
      )}
      {deleting && (
        <MediaDeleteDialog
          assets={deleting}
          onClose={() => setDeleting(undefined)}
          onDone={(message) => {
            setDeleting(undefined);
            setSelected([]);
            announce(message);
          }}
        />
      )}
      {folderDialog && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open && !busy) setFolderDialog(undefined);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content className="modal">
              <div className="modal-title">
                <Dialog.Title>
                  {folderDialog.mode === "delete"
                    ? tr("Delete folder?")
                    : folderDialog.id
                      ? tr("Rename folder")
                      : tr("New folder")}
                </Dialog.Title>
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
                {folderDialog.mode === "delete"
                  ? tr(
                      "All files in this folder move to the shared library root. No media is deleted.",
                    )
                  : tr(
                      "Give this shared folder a clear name so it is easy to find.",
                    )}
              </Dialog.Description>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    if (folderDialog.mode === "delete") {
                      await deleteFolder.mutateAsync({
                        folderId: folderDialog.id!,
                      });
                      switchView("shared");
                    } else {
                      const f = await saveFolder.mutateAsync({
                        folderId: folderDialog.id,
                        name: folderDialog.name,
                      });
                      switchView("shared", f.id);
                    }
                    setFolderDialog(undefined);
                  } catch {
                    /* Visible below. */
                  }
                }}
              >
                <label className="field media-folder-field">
                  {tr("Folder name")}
                  <input
                    required
                    autoFocus
                    value={folderDialog.name}
                    maxLength={100}
                    disabled={busy || folderDialog.mode === "delete"}
                    onChange={(e) =>
                      setFolderDialog({ ...folderDialog, name: e.target.value })
                    }
                  />
                </label>
                {(saveFolder.error || deleteFolder.error) && (
                  <p role="alert" className="error-banner">
                    {(saveFolder.error || deleteFolder.error)?.message}
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setFolderDialog(undefined)}
                  >
                    {tr("Cancel")}
                  </button>
                  <button
                    className={`button ${folderDialog.mode === "delete" ? "danger-outline" : "primary"}`}
                    disabled={busy || !folderDialog.name.trim()}
                  >
                    {folderDialog.mode === "delete"
                      ? tr("Delete folder, keep files")
                      : tr("Save folder")}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {batchDialog && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open && !busy) setBatchDialog(undefined);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content className="modal">
              <div className="modal-title">
                <Dialog.Title>
                  {batchDialog === "locate"
                    ? tr("Move or share selected media")
                    : tr("Edit tags on selected media")}
                </Dialog.Title>
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
                  "Apply to {{count}} selected files. Existing project references are preserved.",
                  { count: chosen.length },
                )}
              </Dialog.Description>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void changeBatch(
                    batchDialog === "locate"
                      ? {
                          asset_ids: chosen.map((a) => a.id),
                          action: "locate",
                          destination: { folder_id: batchFolder || undefined },
                        }
                      : {
                          asset_ids: chosen.map((a) => a.id),
                          action: batchDialog,
                          tags: batchTags,
                        },
                  );
                }}
              >
                <div className="media-batch-fields">
                  {batchDialog === "locate" ? (
                    <label className="field">
                      {tr("Shared library folder")}
                      <select
                        value={batchFolder}
                        onChange={(e) => setBatchFolder(e.target.value)}
                        disabled={busy}
                      >
                        <option value="">{tr("Collection root")}</option>
                        {(folders.data || []).map((f) => (
                          <option
                            key={f.id}
                            value={f.id}
                            disabled={f.id.startsWith("pending:")}
                          >
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <small>
                        {tr(
                          "Private files become shared. Other collections keep their memberships.",
                        )}
                      </small>
                    </label>
                  ) : (
                    <>
                      <label className="field">
                        {tr("Tag action")}
                        <select
                          value={batchDialog}
                          onChange={(e) =>
                            setBatchDialog(
                              e.target.value as "add_tags" | "remove_tags",
                            )
                          }
                          disabled={busy}
                        >
                          <option value="add_tags">{tr("Add tags")}</option>
                          <option value="remove_tags">
                            {tr("Remove tags")}
                          </option>
                        </select>
                      </label>
                      <TagInput
                        tags={batchTags}
                        onChange={setBatchTags}
                        disabled={busy}
                      />
                      <p className="muted">
                        {tr(
                          "Only these tags change. Other tags stay as they are.",
                        )}
                      </p>
                    </>
                  )}
                </div>
                {batch.error && (
                  <p role="alert" className="error-banner">
                    {batch.error.message}
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setBatchDialog(undefined)}
                  >
                    {tr("Cancel")}
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !chosen.length ||
                      (batchDialog !== "locate" && !batchTags.length)
                    }
                  >
                    <Check size={16} />
                    {tr("Apply changes")}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
