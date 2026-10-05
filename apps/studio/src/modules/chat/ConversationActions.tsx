import { DialogBody, DialogFooter, DialogForm } from "@/components/ui/dialog";
import type { AgentChatSummary } from "@/api/generated/client";
import { chatWrites } from "@/api/mutations";
import { Modal } from "@/components/modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { tr } from "@/lib/i18n";
import { useChatDock } from "@/modules/chat/store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Pencil,
  Settings2,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

export function ConversationActions({
  chat,
  disabled = false,
  moveUp,
  moveDown,
}: {
  chat: AgentChatSummary;
  disabled?: boolean;
  moveUp?: () => void;
  moveDown?: () => void;
}) {
  const client = useQueryClient();
  const options = chatWrites.update(client, chat.id);
  const update = useMutation({
    ...options,
    onError: (error, request, context, mutationContext) => {
      options.onError?.(error, request, context, mutationContext);
      toast.error(error.message);
    },
  });
  const [dialog, setDialog] = useState<"rename" | "settings" | "delete" | null>(
    null,
  );
  const busy = disabled || chat.running || update.isPending;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={tr("Conversation options for {{title}}", {
              title: chat.title || tr("New conversation"),
            })}
            disabled={busy}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[70] w-64">
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil />
            {tr("Rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              update.mutate({
                expected_version: chat.version,
                archived: !chat.archived,
              })
            }
          >
            {chat.archived ? <ArchiveRestore /> : <Archive />}
            {tr(
              chat.archived ? "Restore conversation" : "Archive conversation",
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("settings")}>
            <Settings2 />
            {tr("Conversation settings")}
          </DropdownMenuItem>
          {(moveUp || moveDown) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!moveUp} onSelect={moveUp}>
                <ArrowUp />
                {tr("Move conversation up")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!moveDown} onSelect={moveDown}>
                <ArrowDown />
                {tr("Move conversation down")}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("delete")}
          >
            <Trash2 />
            {tr("Delete conversation")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {(dialog === "rename" || dialog === "settings") && (
        <ConversationDetails
          chat={chat}
          renameOnly={dialog === "rename"}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <DeleteConversation chat={chat} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function ConversationDetails({
  chat,
  renameOnly,
  onClose,
}: {
  chat: AgentChatSummary;
  renameOnly: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const update = useMutation(chatWrites.update(client, chat.id));
  const [title, setTitle] = useState(chat.title || tr("New conversation"));
  const [directory, setDirectory] = useState(chat.directory);
  const [version, setVersion] = useState(chat.version);
  const titleId = useId();
  const directoryId = useId();
  return (
    <Modal
      open
      title={tr(renameOnly ? "Rename conversation" : "Conversation settings")}
      onOpenChange={(open) => !open && !update.isPending && onClose()}
    >
      <DialogForm
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate(
            {
              expected_version: version,
              title,
              ...(!renameOnly ? { directory } : {}),
            },
            { onSuccess: onClose },
          );
        }}
      >
        <DialogBody className="space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={titleId}>{tr("Title")}</FieldLabel>
              <Input
                id={titleId}
                className="h-9"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
                disabled={update.isPending}
                autoFocus
              />
            </Field>
            {!renameOnly && (
              <>
                <Field>
                  <FieldLabel htmlFor={directoryId}>
                    {tr("Source directory")}
                  </FieldLabel>
                  <Input
                    id={directoryId}
                    className="h-9"
                    value={directory}
                    onChange={(event) => setDirectory(event.target.value)}
                    placeholder={tr("Optional absolute backend path")}
                    maxLength={2000}
                    disabled={update.isPending}
                  />
                </Field>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {tr(
                    "The directory is on the backend machine. CLI tools may read its files. Executables must be trusted.",
                  )}
                </p>
              </>
            )}
          </FieldGroup>
          {update.error && (
            <p role="alert" className="text-sm text-destructive">
              {update.error.message}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          {update.error && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTitle(chat.title);
                setDirectory(chat.directory);
                setVersion(chat.version);
                update.reset();
              }}
            >
              {tr("Reload conversation")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={update.isPending}
            onClick={onClose}
          >
            {tr("Cancel")}
          </Button>
          <Button type="submit" disabled={update.isPending || chat.running}>
            {tr(update.isPending ? "Saving…" : "Save")}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Modal>
  );
}

function DeleteConversation({
  chat,
  onClose,
}: {
  chat: AgentChatSummary;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const options = chatWrites.delete(client, chat.id);
  const remove = useMutation({
    ...options,
    onSuccess: async (result, version, context, mutationContext) => {
      await options.onSuccess?.(result, version, context, mutationContext);
      const state = useChatDock.getState();
      if (state.selectedId === chat.id)
        state.set({ selectedId: null, context: null });
      onClose();
    },
  });
  return (
    <AlertDialog
      open
      onOpenChange={(open) => !open && !remove.isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("Delete conversation")}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogBody>
          <AlertDialogDescription>
            {tr(
              "Delete {{title}} and its messages? Project edits remain in project history.",
              { title: chat.title || tr("New conversation") },
            )}
          </AlertDialogDescription>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          )}
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {tr("Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending || chat.running}
            onClick={(event) => {
              event.preventDefault();
              remove.mutate(chat.version);
            }}
          >
            {tr(remove.isPending ? "Deleting…" : "Confirm delete conversation")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
