import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Folder,
  FolderPlus,
  Pencil,
  Search,
  Upload,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import AssetCard from "./AssetCard";
import MediaManager from "./MediaManager";
import FolderRemoval from "./FolderRemoval";
import { reads } from "./api/queries";
import { writes } from "./api/mutations";
import { tr, useLocale } from "./i18n";
import type { Asset, Project } from "./types";

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
  const [tab, setTab] = useState<"project" | "library">(
    project ? "project" : "library",
  );
  const [folder, setFolder] = useState("");
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
  const [managed, setManaged] = useState<Asset>();
  const [removingFolder, setRemovingFolder] = useState<{
    id: string;
    name: string;
    projectId?: string;
  }>();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
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
        <div
          className="media-tabs"
          role="tablist"
          aria-label={tr("Media collection")}
        >
          <button
            role="tab"
            aria-selected={tab === "project"}
            onClick={() => {
              setTab("project");
              setFolder("");
              setEditing(null);
            }}
          >
            {tr("Project media")}
          </button>
          <button
            role="tab"
            aria-selected={tab === "library"}
            onClick={() => {
              setTab("library");
              setFolder("");
              setEditing(null);
            }}
          >
            {tr("Library")}
          </button>
        </div>
      )}
      <p className="media-scope-hint">
        {projectId
          ? tr("Private collection for this project")
          : tr("Shared media for all projects")}
      </p>
      <div className="search">
        <Search size={16} />
        <input
          aria-label={tr("Search media")}
          placeholder={tr("Search media…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
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
          <button
            className="icon-button"
            aria-label={tr("New folder")}
            onClick={() => {
              setEditing("new");
              setName("");
            }}
          >
            <FolderPlus size={16} />
          </button>
          {folder && (
            <button
              className="icon-button"
              aria-label={tr("Rename folder")}
              onClick={() => {
                setEditing(folder);
                setName(folders.find((f) => f.id === folder)?.name || "");
              }}
            >
              <Pencil size={14} />
            </button>
          )}
          {folder && (
            <button
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
            </button>
          )}
        </div>
        {editing && (
          <form
            className="folder-form"
            onSubmit={(e) => {
              e.preventDefault();
              folderMutation.mutate({
                folderId: editing === "new" ? undefined : editing!,
                name,
                projectId,
              });
            }}
          >
            <input
              autoFocus
              aria-label={tr("Folder name")}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="button"
              disabled={!name.trim() || folderMutation.isPending}
            >
              {tr("Save")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setEditing(null)}
            >
              {tr("Cancel")}
            </button>
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
        {[
          ["all", tr("All")],
          ["image", tr("Images")],
          ["video", tr("Video")],
          ["audio", tr("Audio")],
        ].map(([key, label]) => (
          <button
            key={key}
            className={kind === key ? "selected" : ""}
            onClick={() => setKind(key)}
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
              <button
                className="media-manage-button"
                aria-label={tr("Manage {{name}}", { name: a.name })}
                onClick={() => setManaged(a)}
              >
                <SlidersHorizontal size={13} />
                {tr("Manage media")}
              </button>
              <details className="asset-menu">
                <summary>{tr("Organize & insert")}</summary>
                {project && a.kind !== "audio" && (
                  <button className="text-button" onClick={() => onOverlay(a)}>
                    {tr("Add as overlay")}
                  </button>
                )}
                {project && tab === "library" && (
                  <button
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
                  </button>
                )}
                {project && tab === "project" && (
                  <button
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
                  </button>
                )}
                <label className="field">
                  {tr("Move to folder")}
                  <select
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
                  </select>
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
      {managed && (
        <MediaManager
          key={managed.id}
          asset={
            [...projectAssets, ...libraryAssets].find(
              (a) => a.id === managed.id,
            ) || managed
          }
          onClose={() => setManaged(undefined)}
          onNotice={onError}
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
