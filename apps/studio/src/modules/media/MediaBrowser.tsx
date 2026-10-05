import { DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { RouteTabs } from "@/components/route-tabs";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { writes } from "@/api/mutations";
import { reads } from "@/api/queries";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset, Project } from "@/lib/types";
import { scriptTakeStatus } from "@/modules/script/scriptTimeline";
import AssetCard from "@/modules/media/AssetCard";
import FolderRemoval from "@/modules/media/FolderRemoval";
import MediaDeleteDialog from "@/modules/media/MediaDeleteDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Folder,
  FolderPlus,
  LoaderCircle,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";

export type MediaDestination = { project_id?: string; folder_id?: string };
export default function MediaBrowser({
  project,
  projectAssets,
  libraryAssets,
  onAdd,
  onAddNarration,
  onPreview,
  onImport,
  onDestination,
  onError,
  onRemoved,
  activeId,
}: {
  project?: Project;
  projectAssets: Asset[];
  libraryAssets: Asset[];
  onAdd: (asset: Asset) => void;
  onAddNarration: (asset: Asset, lineId: string, withCaptions: boolean) => void;
  onPreview: (asset: Asset) => void;
  onImport: () => void;
  onDestination: (d: MediaDestination) => void;
  onError: (message: string) => void;
  onRemoved?: (ids: string[]) => void;
  /** Asset open in the preview monitor. */
  activeId?: string;
}) {
  useLocale();
  const query = useQueryClient();
  const { search: navigation, updateSearch } = useWorkspaceNavigation();
  const tab = project ? (navigation.mediaScope ?? "project") : "library";
  const folder = navigation.mediaFolder ?? "";
  const setFolder = (id: string) =>
    void updateSearch({ mediaFolder: id || undefined });
  const [foldersOpen, setFoldersOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const openFolders = () => {
    const rect = picker.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({
        left: Math.min(rect.right + 8, window.innerWidth - 244),
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 260)),
      });
    }
    setFoldersOpen(true);
  };
  useEffect(() => {
    if (!foldersOpen) return;
    const dismiss = (e: PointerEvent) => {
      if ((e.target as Element).closest("[draggable='true']")) return;
      if (
        !picker.current?.contains(e.target as Node) &&
        !menu.current?.contains(e.target as Node)
      )
        setFoldersOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [foldersOpen]);
  const [removingFolder, setRemovingFolder] = useState<{
    id: string;
    name: string;
    projectId?: string;
  }>();
  const [search, setSearch] = useState("");
  const kind = navigation.mediaKind ?? "all";
  const [editing, setEditing] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [deleting, setDeleting] = useState<Asset[]>();
  const [moveFolder, setMoveFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setEditing(null);
    setFoldersOpen(false);
  }, [tab]);
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds([]);
    setMoveOpen(false);
    setRemoveOpen(false);
  }, [tab, folder, kind, search]);
  const folderForm = useForm({ defaultValues: { name: "" } });
  const name = folderForm.watch("name");
  const setName = (value: string) =>
    folderForm.setValue("name", value, { shouldDirty: true });
  const projectId = tab === "project" ? project?.id : undefined;
  const scope = projectId || "library";
  const { data: folders = [], error } = useQuery(
    reads.folders(query, projectId),
  );
  useEffect(() => {
    onDestination({ project_id: projectId, folder_id: folder || undefined });
  }, [projectId, folder, onDestination]);
  const assets = projectId ? projectAssets : libraryAssets;
  const filtered = assets.filter(
    (a) =>
      (!folder || a.locations?.[scope] === folder) &&
      (kind === "all" || a.kind === kind) &&
      `${a.name} ${a.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selectedAssets = assets.filter((asset) =>
    selectedIds.includes(asset.id),
  );
  const visibleSelected = filtered.filter((asset) =>
    selectedIds.includes(asset.id),
  );
  const folderMutation = useMutation({
    ...writes.folder(query),
    onSuccess: (f) => {
      setFolder(f.id);
      setEditing(null);
    },
    onError: (e) => onError(e.message),
  });
  const location = useMutation({
    ...writes.location(query),
    onError: (e) => onError(e.message),
  });
  const batch = useMutation(writes.mediaBatch(query));
  const removeMembership = useMutation(writes.removeMediaMembership(query));
  const createMoveFolder = useMutation(writes.folder(query));
  const busy =
    location.isPending ||
    batch.isPending ||
    removeMembership.isPending ||
    createMoveFolder.isPending;
  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };
  const toggleSelection = (id: string) => {
    setFeedback("");
    setSelectionMode(true);
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else if (selectedIds.length >= 100) {
      setFeedback(tr("Select up to 100 media files at a time."));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };
  const selectVisible = () => {
    setSelectionMode(true);
    setSelectedIds((current) =>
      [...new Set([...current, ...filtered.map((asset) => asset.id)])].slice(
        0,
        100,
      ),
    );
    if (filtered.length > 100)
      setFeedback(tr("Selected the first 100 media files in this view."));
  };
  const moveSelected = async () => {
    setFeedback("");
    try {
      await batch.mutateAsync({
        asset_ids: selectedAssets.map((asset) => asset.id),
        action: "locate",
        destination: {
          project_id: projectId,
          folder_id: moveFolder || undefined,
        },
      });
      const count = selectedAssets.length;
      setMoveOpen(false);
      clearSelection();
      setFolder(moveFolder);
      setFeedback(tr("Moved {{count}} media files to this folder.", { count }));
    } catch {
      /* Mutation error is shown in the dialog. */
    }
  };
  const removeSelected = async () => {
    setFeedback("");
    let removed = 0;
    for (const asset of selectedAssets) {
      try {
        await removeMembership.mutateAsync({
          assetId: asset.id,
          request: {
            project_id: projectId,
            expected_version: asset.version,
          },
        });
        removed += 1;
        setSelectedIds((current) => current.filter((id) => id !== asset.id));
        onRemoved?.([asset.id]);
      } catch (error) {
        setFeedback(
          tr(
            "Removed {{count}} files. Remaining selection was kept. {{error}}",
            {
              count: removed,
              error: (error as Error).message,
            },
          ),
        );
        return;
      }
    }
    setRemoveOpen(false);
    clearSelection();
    setFeedback(
      tr(
        "Removed {{count}} media files from this collection. Originals remain on disk.",
        {
          count: removed,
        },
      ),
    );
  };
  const move = (assetId: string, folderId: string) =>
    !folderId.startsWith("pending:") &&
    location.mutate({
      assetId,
      destination: { project_id: projectId, folder_id: folderId || undefined },
    });
  return (
    <div className="media-browser">
      {project && (
        <RouteTabs
          label={tr("Media collection")}
          value={tab}
          className="border-b border-border"
          items={[
            {
              value: "project",
              label: tr("Project media"),
              search: { mediaScope: undefined, mediaFolder: undefined },
            },
            {
              value: "library",
              label: tr("Library"),
              search: { mediaScope: "library", mediaFolder: undefined },
            },
          ]}
        />
      )}
      <p className="media-scope-hint">
        {projectId
          ? tr("Private collection for this project")
          : tr("Shared media for all projects")}
      </p>
      <SearchField
        wrapperClassName="search"
        aria-label={tr("Search media")}
        placeholder={tr("Search media…")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div
        className="folder-picker"
        ref={picker}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setFoldersOpen(false);
            e.stopPropagation();
          }
        }}
      >
        <div className="folder-tools">
          <button
            className="folder-current"
            aria-label={tr("Choose folder")}
            aria-expanded={foldersOpen}
            onClick={() =>
              foldersOpen ? setFoldersOpen(false) : openFolders()
            }
            onDragEnter={openFolders}
          >
            <Folder size={14} />
            <span>
              {folders.find((f) => f.id === folder)?.name || tr("All media")}
            </span>
            <ChevronDown size={12} />
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            aria-label={tr("New folder")}
            onClick={() => {
              setEditing("new");
              setName("");
            }}
          >
            <FolderPlus size={16} />
          </Button>
          {folder && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button"
              aria-label={tr("Rename folder")}
              onClick={() => {
                setEditing(folder);
                setName(folders.find((f) => f.id === folder)?.name || "");
              }}
            >
              <Pencil size={14} />
            </Button>
          )}
          {folder && (
            <Button
              variant="destructive"
              size="icon-sm"
              className="icon-button danger-text"
              aria-label={tr("Delete folder")}
              disabled={folder.startsWith("pending:")}
              onClick={() =>
                setRemovingFolder({
                  id: folder,
                  name: folders.find((f) => f.id === folder)?.name || "",
                  projectId,
                })
              }
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
        {editing && (
          <form
            className="folder-form"
            onSubmit={folderForm.handleSubmit(() => {
              folderMutation.mutate({
                folderId: editing === "new" ? undefined : editing!,
                name,
                projectId,
              });
            })}
          >
            <Input
              autoFocus
              aria-label={tr("Folder name")}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              variant="outline"
              className="button"
              disabled={!name.trim() || folderMutation.isPending}
            >
              {tr("Save")}
            </Button>
            <Button
              variant="ghost"
              type="button"
              className="text-button"
              onClick={() => setEditing(null)}
            >
              {tr("Cancel")}
            </Button>
          </form>
        )}
        {foldersOpen &&
          createPortal(
            <div
              className="media-folders floating-folders"
              ref={menu}
              style={menuPosition}
            >
              {[{ id: "", name: tr("All media") }, ...folders].map((f) => (
                <button
                  key={f.id}
                  disabled={f.id.startsWith("pending:")}
                  className={folder === f.id ? "selected" : ""}
                  aria-pressed={folder === f.id}
                  onClick={() => {
                    setFolder(f.id);
                    setFoldersOpen(false);
                  }}
                  onDragOver={(e) => {
                    if (
                      e.dataTransfer.types.includes(
                        "application/synkinema-asset",
                      )
                    ) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      e.currentTarget.classList.add("drop-target");
                    }
                  }}
                  onDragLeave={(e) =>
                    e.currentTarget.classList.remove("drop-target")
                  }
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData(
                      "application/synkinema-asset",
                    );
                    e.currentTarget.classList.remove("drop-target");
                    if (id) {
                      e.preventDefault();
                      e.stopPropagation();
                      move(id, f.id);
                      setFoldersOpen(false);
                    }
                  }}
                >
                  <Folder size={14} />
                  <span>{f.name}</span>
                  <small>
                    {
                      assets.filter(
                        (a) => !f.id || a.locations?.[scope] === f.id,
                      ).length
                    }
                  </small>
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
      <div className="filter-row">
        {(
          [
            ["all", tr("All")],
            ["image", tr("Images")],
            ["video", tr("Video")],
            ["audio", tr("Audio")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={kind === key ? "selected" : ""}
            onClick={() =>
              void updateSearch({ mediaKind: key === "all" ? undefined : key })
            }
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error.message}</p>}
      <div className="media-select-header">
        <span>
          {selectionMode
            ? tr("{{count}} selected", { count: selectedAssets.length })
            : tr("{{count}} media files", { count: filtered.length })}
        </span>
        <div>
          <button
            type="button"
            disabled={
              !filtered.length ||
              busy ||
              visibleSelected.length === filtered.length
            }
            onClick={selectVisible}
          >
            {tr("Select all")}
          </button>
          {selectionMode && (
            <button type="button" disabled={busy} onClick={clearSelection}>
              <X size={13} /> {tr("Clear")}
            </button>
          )}
        </div>
      </div>
      {selectionMode && selectedAssets.length > 0 && (
        <div className="media-bulk-actions">
          <Button
            variant="outline"
            className="button"
            disabled={busy}
            aria-label={tr("Move to folder")}
            title={tr("Move to folder")}
            onClick={() => {
              batch.reset();
              createMoveFolder.reset();
              setMoveFolder(folder);
              setNewFolderName("");
              setMoveOpen(true);
            }}
          >
            <Folder size={14} /> {tr("Move")}
          </Button>
          <Button
            variant="outline"
            className="button"
            disabled={busy}
            aria-label={
              projectId ? tr("Remove from project") : tr("Remove from library")
            }
            title={
              projectId ? tr("Remove from project") : tr("Remove from library")
            }
            onClick={() => {
              removeMembership.reset();
              setRemoveOpen(true);
            }}
          >
            <Trash2 size={14} />
            {tr("Remove")}
          </Button>
          <button
            type="button"
            className="media-delete-link"
            disabled={busy}
            onClick={() => setDeleting(selectedAssets)}
          >
            {tr("Delete from disk")}
          </button>
        </div>
      )}
      {feedback && (
        <p className="media-action-feedback" role="status">
          {feedback}
        </p>
      )}
      <div className="asset-scroll">
        <div className="media-tile-grid">
          {filtered.map((a) => {
            const line = project?.script_lines.find(
              (item) => item.audio_asset_id === a.id,
            );
            const status =
              line && project ? scriptTakeStatus(project, line) : undefined;
            return (
              <AssetCard
                key={a.id}
                asset={a}
                active={a.id === activeId}
                selectionMode={selectionMode}
                selected={selectedIds.includes(a.id)}
                onSelect={() => toggleSelection(a.id)}
                onAdd={() =>
                  line ? onAddNarration(a, line.id, false) : onAdd(a)
                }
                narration={
                  line && status
                    ? {
                        status,
                        canCaption:
                          !!line.audio_text && line.audio_text.length <= 2000,
                        onAddCaptions: () => onAddNarration(a, line.id, true),
                      }
                    : undefined
                }
                onPreview={() => onPreview(a)}
              />
            );
          })}
        </div>
        {!filtered.length && (
          <div className="empty small">
            <Folder />
            <p>{tr("No media in this view")}</p>
            <small>
              {projectId
                ? tr("Import files or add media from Library")
                : tr("Import files or choose another folder")}
            </small>
          </div>
        )}
      </div>
      {removingFolder && (
        <FolderRemoval
          folderId={removingFolder.id}
          projectId={removingFolder.projectId}
          name={removingFolder.name}
          onClose={() => setRemovingFolder(undefined)}
          onDone={() => {
            setRemovingFolder(undefined);
            setFolder("");
          }}
        />
      )}
      <Dialog
        open={moveOpen}
        onOpenChange={(open) => {
          if (!open && !busy) setMoveOpen(false);
        }}
      >
        <DialogContent className="media-action-dialog">
          <DialogHeader>
            <DialogTitle>{tr("Move selected media")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {tr(
                "Choose a folder in this collection. Files stay available in other collections and on disk.",
              )}
            </DialogDescription>
            <div
              className="media-move-options"
              role="radiogroup"
              aria-label={tr("Destination folder")}
            >
              {[{ id: "", name: tr("Collection root") }, ...folders].map(
                (item) => (
                  <label key={item.id}>
                    <input
                      type="radio"
                      name="media-destination"
                      value={item.id}
                      checked={moveFolder === item.id}
                      disabled={busy || item.id.startsWith("pending:")}
                      onChange={() => setMoveFolder(item.id)}
                    />
                    <Folder size={15} />
                    <span>{item.name}</span>
                    <small>
                      {
                        assets.filter(
                          (asset) =>
                            (asset.locations?.[scope] || "") === item.id,
                        ).length
                      }
                    </small>
                  </label>
                ),
              )}
            </div>
            {selectedAssets.every(
              (asset) => (asset.locations?.[scope] || "") === moveFolder,
            ) && (
              <p className="media-action-feedback">
                {tr("Choose or create another folder to move these files.")}
              </p>
            )}
            <div className="media-new-folder">
              <Input
                aria-label={tr("New folder name")}
                placeholder={tr("New folder name")}
                value={newFolderName}
                maxLength={100}
                disabled={busy}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!newFolderName.trim() || busy}
                onClick={async () => {
                  try {
                    const created = await createMoveFolder.mutateAsync({
                      name: newFolderName.trim(),
                      projectId,
                    });
                    setMoveFolder(created.id);
                    setNewFolderName("");
                  } catch {
                    /* Mutation error is shown below. */
                  }
                }}
              >
                {createMoveFolder.isPending ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <FolderPlus size={15} />
                )}
                {tr("Create")}
              </Button>
            </div>
            {(batch.error || createMoveFolder.error) && (
              <p role="alert" className="error-banner">
                {(batch.error || createMoveFolder.error)?.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setMoveOpen(false)}
            >
              {tr("Cancel")}
            </Button>
            <Button
              disabled={
                busy ||
                !selectedAssets.length ||
                selectedAssets.every(
                  (asset) => (asset.locations?.[scope] || "") === moveFolder,
                )
              }
              onClick={() => void moveSelected()}
            >
              {batch.isPending ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Folder size={15} />
              )}
              {tr("Move {{count}} files", { count: selectedAssets.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoveOpen(false);
        }}
      >
        <DialogContent className="media-action-dialog">
          <DialogHeader>
            <DialogTitle>
              {projectId
                ? tr("Remove from this project?")
                : tr("Remove from shared library?")}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {projectId
                ? tr(
                    "Original files stay on disk. Media used by this project cannot be removed until its timeline clips and project references are removed.",
                  )
                : tr(
                    "Original files stay on disk. Projects already using shared media keep access through their private collections.",
                  )}{" "}
              {tr(
                "If this is a file's last collection, use Delete from disk instead.",
              )}
            </DialogDescription>
            <ul className="media-selected-list">
              {selectedAssets.map((asset) => (
                <li key={asset.id}>{asset.name}</li>
              ))}
            </ul>
            {(removeMembership.error || feedback) && (
              <p role="alert" className="error-banner">
                {feedback || removeMembership.error?.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRemoveOpen(false)}
            >
              {tr("Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !selectedAssets.length}
              onClick={() => void removeSelected()}
            >
              {removeMembership.isPending ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Trash2 size={15} />
              )}
              {tr("Remove {{count}} files", { count: selectedAssets.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {deleting && (
        <MediaDeleteDialog
          assets={deleting}
          onClose={() => setDeleting(undefined)}
          onDone={(message) => {
            onRemoved?.(deleting.map((asset) => asset.id));
            setDeleting(undefined);
            clearSelection();
            setFeedback(message);
          }}
        />
      )}
      <button className="import-area" onClick={onImport}>
        <Upload size={18} />
        <span>
          {tr("Drop files or browse")}
          <small>
            {projectId
              ? tr("Imports stay in this project")
              : tr("Import into shared library")}
          </small>
        </span>
      </button>
    </div>
  );
}
