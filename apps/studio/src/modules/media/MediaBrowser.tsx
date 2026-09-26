import { RouteTabs } from "@/components/route-tabs";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { writes } from "@/api/mutations";
import { reads } from "@/api/queries";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tr, useLocale } from "@/lib/i18n";
import type { Asset, Project } from "@/lib/types";
import AssetCard from "@/modules/media/AssetCard";
import FolderRemoval from "@/modules/media/FolderRemoval";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
  Upload,
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
  onPreview,
  onImport,
  onDestination,
  onError,
  activeId,
}: {
  project?: Project;
  projectAssets: Asset[];
  libraryAssets: Asset[];
  onAdd: (asset: Asset) => void;
  onPreview: (asset: Asset) => void;
  onImport: () => void;
  onDestination: (d: MediaDestination) => void;
  onError: (message: string) => void;
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
        <div className="media-tile-grid">
          {filtered.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              active={a.id === activeId}
              onAdd={() => onAdd(a)}
              onPreview={() => onPreview(a)}
            />
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
