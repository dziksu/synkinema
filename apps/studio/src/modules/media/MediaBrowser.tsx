import { RouteTabs } from "@/components/route-tabs";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { writes } from "@/api/mutations";
import { reads } from "@/api/queries";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset, Project } from "@/lib/types";
import AssetCard from "@/modules/media/AssetCard";
import FolderRemoval from "@/modules/media/FolderRemoval";
import { RoutedMediaManager } from "@/modules/media/routed-media-manager";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Folder,
  FolderPlus,
  Pencil,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";

export type MediaDestination = { project_id?: string; folder_id?: string };
export default function MediaBrowser({
  project,
  projectAssets,
  libraryAssets,
  onAdd,
  onOverlay,
  onPreview,
  onImport,
  onDestination,
  onError,
  renderAsset,
}: {
  project?: Project;
  projectAssets: Asset[];
  libraryAssets: Asset[];
  onAdd: (asset: Asset) => void;
  onOverlay: (asset: Asset) => void;
  onPreview: (asset: Asset) => void;
  onImport: () => void;
  onDestination: (d: MediaDestination) => void;
  onError: (message: string) => void;
  renderAsset?: (asset: Asset) => ReactNode;
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
  const setManaged = (asset?: Asset) =>
    void updateSearch({ mediaId: asset?.id, mediaTab: undefined });
  const [removingFolder, setRemovingFolder] = useState<{
    id: string;
    name: string;
    projectId?: string;
  }>();
  const [search, setSearch] = useState("");
  const kind = navigation.mediaKind ?? "all";
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    setEditing(null);
    setFoldersOpen(false);
  }, [tab]);
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
      <div className="asset-scroll">
        <div className={renderAsset ? "library-grid" : "asset-grid"}>
          {filtered.map((a) => (
            <div
              key={a.id}
              className="organized-asset"
              draggable={!!renderAsset}
              onDragStart={(e) => {
                if (renderAsset) {
                  e.dataTransfer.setData("application/synkinema-asset", a.id);
                  e.dataTransfer.effectAllowed = "copy";
                }
              }}
            >
              {renderAsset ? (
                renderAsset(a)
              ) : (
                <AssetCard
                  asset={a}
                  onAdd={() => onAdd(a)}
                  onPreview={() => onPreview(a)}
                />
              )}
              <Button
                variant="outline"
                className="media-manage-button"
                aria-label={tr("Manage {{name}}", { name: a.name })}
                onClick={() => setManaged(a)}
              >
                <SlidersHorizontal size={13} />
                {tr("Manage media")}
              </Button>
              <details className="asset-menu">
                <summary>{tr("Organize & insert")}</summary>
                {project && a.kind !== "audio" && (
                  <Button
                    variant="ghost"
                    className="text-button"
                    onClick={() => onOverlay(a)}
                  >
                    {tr("Add as overlay")}
                  </Button>
                )}
                {project && tab === "library" && (
                  <Button
                    variant="ghost"
                    className="text-button"
                    disabled={
                      location.isPending || project.id in (a.locations || {})
                    }
                    onClick={() =>
                      location.mutate({
                        assetId: a.id,
                        destination: { project_id: project.id },
                      })
                    }
                  >
                    {project.id in (a.locations || {})
                      ? tr("In project media")
                      : tr("Add to project media")}
                  </Button>
                )}
                {project && tab === "project" && (
                  <Button
                    variant="ghost"
                    className="text-button"
                    disabled={
                      location.isPending || "library" in (a.locations || {})
                    }
                    onClick={() =>
                      location.mutate({ assetId: a.id, destination: {} })
                    }
                  >
                    {"library" in (a.locations || {})
                      ? tr("Shared in library")
                      : tr("Share to library")}
                  </Button>
                )}
                <label className="field">
                  {tr("Move to folder")}
                  <NativeSelect
                    aria-label={tr("Folder for {{name}}", { name: a.name })}
                    value={a.locations?.[scope] || ""}
                    disabled={location.isPending}
                    onChange={(e) => move(a.id, e.target.value)}
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
              </details>
            </div>
          ))}
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
      <RoutedMediaManager onNotice={onError} />
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
