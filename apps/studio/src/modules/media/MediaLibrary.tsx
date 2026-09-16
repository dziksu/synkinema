import { Link } from "@tanstack/react-router";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import type { WorkspaceSearch } from "@/lib/workspace-search";
import type { AssetBatchUpdate } from "@/api/generated/client";
import { writes } from "@/api/mutations";
import { reads } from "@/api/queries";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset } from "@/lib/types";
import { fileSize } from "@/modules/exports/RenderQueue";
import type { MediaDestination } from "@/modules/media/MediaBrowser";
import MediaDeleteDialog from "@/modules/media/MediaDeleteDialog";
import { RoutedMediaManager } from "@/modules/media/routed-media-manager";
import TagInput from "@/modules/media/TagInput";
import AgentPromptCopyButton from "@/modules/settings/AgentPromptCopyButton";
import { sharedLibraryAgentPrompt } from "@/modules/settings/agentPrompts";
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
  SlidersHorizontal,
  Square,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
  const { search: navigation, updateSearch } = useWorkspaceNavigation();
  const view = navigation.libraryView ?? "shared";
  const folder = view === "shared" ? (navigation.mediaFolder ?? "") : "";
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const setManaged = (asset?: Asset) =>
    void updateSearch({ mediaId: asset?.id, mediaTab: undefined });
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
  const folderForm = useForm({ defaultValues: { name: "" } });
  const folderName = folderForm.watch("name");
  useEffect(() => {
    folderForm.reset({ name: folderDialog?.name || "" });
  }, [folderDialog, folderForm]);
  const batchForm = useForm({
    defaultValues: { tags: [] as string[], folder: "" },
  });
  const { tags: batchTags, folder: batchFolder } = batchForm.watch();
  const setBatchTags = (tags: string[]) =>
    batchForm.setValue("tags", tags, { shouldDirty: true });
  const setBatchFolder = (folder: string) =>
    batchForm.setValue("folder", folder, { shouldDirty: true });
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
  const switchView = (next: WorkspaceSearch["libraryView"], folderId = "") => {
    void updateSearch({
      libraryView: next === "shared" ? undefined : next,
      mediaFolder: folderId || undefined,
    });
  };
  useEffect(() => {
    setSelected([]);
  }, [view, folder]);
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
        <Link
          to="."
          resetScroll={false}
          activeOptions={{
            exact: true,
            includeSearch: true,
            explicitUndefined: true,
          }}
          className={view === "shared" && !folder ? "selected" : ""}
          search={(previous) => ({
            ...previous,
            libraryView: undefined,
            mediaFolder: undefined,
          })}
          {...dropProps("")}
          data-dropping={dropTarget === ""}
        >
          <Globe size={16} />
          <span>{tr("Shared library")}</span>
          <small>{shared.length}</small>
        </Link>
        <Link
          to="."
          resetScroll={false}
          activeOptions={{
            exact: true,
            includeSearch: true,
            explicitUndefined: true,
          }}
          className={view === "all" ? "selected" : ""}
          search={(previous) => ({
            ...previous,
            libraryView: "all",
            mediaFolder: undefined,
          })}
        >
          <HardDrive size={16} />
          <span>{tr("All stored media")}</span>
          <small>{assets.length}</small>
        </Link>
        <Link
          to="."
          resetScroll={false}
          activeOptions={{
            exact: true,
            includeSearch: true,
            explicitUndefined: true,
          }}
          className={view === "private" ? "selected" : ""}
          search={(previous) => ({
            ...previous,
            libraryView: "private",
            mediaFolder: undefined,
          })}
        >
          <LockKeyhole size={16} />
          <span>{tr("Private media")}</span>
          <small>{assets.length - shared.length}</small>
        </Link>
        <div className="media-nav-heading">
          <span className="eyebrow">{tr("SHARED FOLDERS")}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            aria-label={tr("New folder")}
            onClick={() => {
              saveFolder.reset();
              setFolderDialog({ mode: "edit", name: "" });
            }}
          >
            <FolderPlus size={16} />
          </Button>
        </div>
        {(folders.data || []).map((f) => (
          <Link
            to="."
            resetScroll={false}
            activeOptions={{
              exact: true,
              includeSearch: true,
              explicitUndefined: true,
            }}
            key={f.id}
            className={view === "shared" && folder === f.id ? "selected" : ""}
            disabled={f.id.startsWith("pending:")}
            search={(previous) => ({
              ...previous,
              libraryView: undefined,
              mediaFolder: f.id,
            })}
            {...dropProps(f.id)}
            data-dropping={dropTarget === f.id}
          >
            <Folder size={15} />
            <span>{f.name}</span>
            <small>
              {shared.filter((a) => a.locations.library === f.id).length}
            </small>
          </Link>
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
                <Button
                  variant="ghost"
                  size="icon-sm"
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
                </Button>
                <Button
                  variant="destructive"
                  size="icon-sm"
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
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="media-library-filters">
          <SearchField
            wrapperClassName="media-library-search"
            aria-label={tr("Search media")}
            placeholder={tr("Search names or tags…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <NativeSelect
            aria-label={tr("Media type")}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">{tr("All types")}</option>
            <option value="image">{tr("Images")}</option>
            <option value="video">{tr("Video")}</option>
            <option value="audio">{tr("Audio")}</option>
          </NativeSelect>
          <NativeSelect
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
          </NativeSelect>
          <label className="media-sort">
            <ArrowDownWideNarrow size={15} />
            <NativeSelect
              aria-label={tr("Sort media")}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">{tr("Newest first")}</option>
              <option value="name">{tr("Name")}</option>
              <option value="size">{tr("Largest first")}</option>
            </NativeSelect>
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
            <Button
              variant="ghost"
              className="text-button"
              onClick={() => {
                void inventory.refetch();
                void folders.refetch();
                batch.reset();
              }}
            >
              {tr("Try again")}
            </Button>
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
              <Button
                variant="ghost"
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
              </Button>
              <Button
                variant="ghost"
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
              </Button>
              <Button
                variant="destructive"
                className="text-button danger-text"
                disabled={busy}
                onClick={() => setDeleting(chosen)}
              >
                <Trash2 size={14} />
                {tr("Delete from disk")}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="icon-button"
                aria-label={tr("Clear selection")}
                onClick={() => setSelected([])}
              >
                <X size={15} />
              </Button>
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
                  <Button
                    variant="outline"
                    className="media-manage-button"
                    onClick={() => setManaged(a)}
                    aria-label={tr("Manage {{name}}", { name: a.name })}
                  >
                    <SlidersHorizontal size={14} />
                    {tr("Manage media")}
                  </Button>
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
            <Button
              variant="outline"
              className="button"
              onClick={() => {
                setSearch("");
                setKind("all");
                setTagFilter("");
              }}
            >
              {tr("Reset filters")}
            </Button>
          </div>
        )}
      </section>
      <RoutedMediaManager onNotice={onNotice} />
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
        <DialogRoot
          open
          onOpenChange={(open) => {
            if (!open && !busy) setFolderDialog(undefined);
          }}
        >
          <>
            <DialogContent showCloseButton={false} className="modal">
              <div className="modal-title">
                <DialogTitle>
                  {folderDialog.mode === "delete"
                    ? tr("Delete folder?")
                    : folderDialog.id
                      ? tr("Rename folder")
                      : tr("New folder")}
                </DialogTitle>
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
                {folderDialog.mode === "delete"
                  ? tr(
                      "All files in this folder move to the shared library root. No media is deleted.",
                    )
                  : tr(
                      "Give this shared folder a clear name so it is easy to find.",
                    )}
              </DialogDescription>
              <form
                onSubmit={folderForm.handleSubmit(async ({ name }) => {
                  try {
                    if (folderDialog.mode === "delete") {
                      await deleteFolder.mutateAsync({
                        folderId: folderDialog.id!,
                      });
                      switchView("shared");
                    } else {
                      const f = await saveFolder.mutateAsync({
                        folderId: folderDialog.id,
                        name,
                      });
                      switchView("shared", f.id);
                    }
                    setFolderDialog(undefined);
                  } catch {
                    /* Visible below. */
                  }
                })}
              >
                <label className="field media-folder-field">
                  {tr("Folder name")}
                  <Input
                    required
                    autoFocus
                    value={folderName}
                    maxLength={100}
                    disabled={busy || folderDialog.mode === "delete"}
                    onChange={(e) =>
                      folderForm.setValue("name", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                  />
                </label>
                {(saveFolder.error || deleteFolder.error) && (
                  <p role="alert" className="error-banner">
                    {(saveFolder.error || deleteFolder.error)?.message}
                  </p>
                )}
                <div className="dialog-actions">
                  <Button
                    variant="outline"
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setFolderDialog(undefined)}
                  >
                    {tr("Cancel")}
                  </Button>
                  <Button
                    variant="default"
                    className={`button ${folderDialog.mode === "delete" ? "danger-outline" : "primary"}`}
                    disabled={busy || !folderName.trim()}
                  >
                    {folderDialog.mode === "delete"
                      ? tr("Delete folder, keep files")
                      : tr("Save folder")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </>
        </DialogRoot>
      )}
      {batchDialog && (
        <DialogRoot
          open
          onOpenChange={(open) => {
            if (!open && !busy) setBatchDialog(undefined);
          }}
        >
          <>
            <DialogContent showCloseButton={false} className="modal">
              <div className="modal-title">
                <DialogTitle>
                  {batchDialog === "locate"
                    ? tr("Move or share selected media")
                    : tr("Edit tags on selected media")}
                </DialogTitle>
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
                  "Apply to {{count}} selected files. Existing project references are preserved.",
                  { count: chosen.length },
                )}
              </DialogDescription>
              <form
                onSubmit={batchForm.handleSubmit(() => {
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
                })}
              >
                <div className="media-batch-fields">
                  {batchDialog === "locate" ? (
                    <label className="field">
                      {tr("Shared library folder")}
                      <NativeSelect
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
                      </NativeSelect>
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
                        <NativeSelect
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
                        </NativeSelect>
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
                  <Button
                    variant="outline"
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setBatchDialog(undefined)}
                  >
                    {tr("Cancel")}
                  </Button>
                  <Button
                    variant="default"
                    className="button primary"
                    disabled={
                      busy ||
                      !chosen.length ||
                      (batchDialog !== "locate" && !batchTags.length)
                    }
                  >
                    <Check size={16} />
                    {tr("Apply changes")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </>
        </DialogRoot>
      )}
    </div>
  );
}
