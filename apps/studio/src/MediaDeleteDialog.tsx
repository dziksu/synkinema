import { useMutation, useQueryClient } from "@tanstack/react-query";
import ConfirmDelete from "./ConfirmDelete";
import { writes } from "./api/mutations";
import type { Asset } from "./types";
import { tr } from "./i18n";
import { fileSize } from "./RenderQueue";
export default function MediaDeleteDialog({
  assets,
  onClose,
  onDone,
}: {
  assets: Asset[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const mutation = useMutation(writes.deleteMedia(useQueryClient()));
  async function remove() {
    try {
      const result = await mutation.mutateAsync({
        assets: assets.map((a) => ({ id: a.id, expected_version: a.version })),
      });
      onDone(
        result.pending_files
          ? tr(
              "Media removed. Some files still need disk cleanup; check Render queue.",
            )
          : tr("Deleted {{count}} media files · {{size}} freed on disk.", {
              count: result.asset_ids.length,
              size: fileSize(result.freed_bytes),
            }),
      );
    } catch {
      /* Keep the selection and conflict visible. */
    }
  }
  return (
    <ConfirmDelete
      title={tr("Delete media from disk?")}
      pending={mutation.isPending}
      error={mutation.error?.message}
      onClose={onClose}
      onConfirm={() => void remove()}
    >
      <p>
        {tr(
          "Original files and thumbnails will be permanently removed from every collection. This cannot be undone.",
        )}
      </p>
      <ul className="deletion-items">
        {assets.map((a) => (
          <li key={a.id}>
            {a.name} · {fileSize(a.size)}
          </li>
        ))}
      </ul>
      <p>
        {tr(
          "Files used by a project, its history or an export cannot be deleted. If any selected file is in use or has changed, nothing is deleted.",
        )}
      </p>
    </ConfirmDelete>
  );
}
