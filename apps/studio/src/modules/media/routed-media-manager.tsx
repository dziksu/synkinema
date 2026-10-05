import { DialogBody, DialogHeader } from "@/components/ui/dialog";
import { reads } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { tr } from "@/lib/i18n";
import MediaManager from "@/modules/media/MediaManager";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function RoutedMediaManager({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const { search, updateSearch } = useWorkspaceNavigation();
  const client = useQueryClient();
  const inventory = useQuery({
    ...reads.inventory(client),
    enabled: !!search.mediaId,
  });
  const close = () => {
    void updateSearch({ mediaId: undefined, mediaTab: undefined });
  };
  if (!search.mediaId) return null;
  const asset = inventory.data?.find((item) => item.id === search.mediaId);
  if (asset)
    return (
      <MediaManager
        key={asset.id}
        asset={asset}
        onClose={close}
        onNotice={onNotice}
      />
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("Manage media")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription role={inventory.isPending ? "status" : "alert"}>
            {inventory.isPending
              ? tr("Loading media…")
              : inventory.error?.message || tr("Media not found.")}
          </DialogDescription>
          {inventory.isError && (
            <Button variant="outline" onClick={() => void inventory.refetch()}>
              {tr("Try again")}
            </Button>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
