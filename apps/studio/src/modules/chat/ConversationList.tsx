import type { AgentChatSummary } from "@/api/generated/client";
import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import {
  DragDropProvider,
  KeyboardSensor,
  PointerSensor,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { cn } from "cn";
import { GripVertical } from "lucide-react";
import { useRef } from "react";
import { ConversationActions } from "./ConversationActions";

const sensors = [
  PointerSensor.configure({
    activationConstraints: () => [
      new PointerActivationConstraints.Delay({ value: 350, tolerance: 6 }),
    ],
  }),
  KeyboardSensor,
];

export function ConversationList({
  chats,
  selectedId,
  pending,
  onSelect,
  onReorder,
}: {
  chats: AgentChatSummary[];
  selectedId: string | null;
  pending: boolean;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const dragIds = useRef<string[]>([]);
  function shift(index: number, direction: number) {
    const ids = chats.map((chat) => chat.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    onReorder(ids);
  }
  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={() => {
        dragIds.current = chats.map((chat) => chat.id);
      }}
      onDragEnd={(event) => {
        const ids = dragIds.current;
        dragIds.current = [];
        if (event.canceled || !event.operation.target || pending || !ids.length)
          return;
        const next = move(ids, event);
        if (next.some((id, index) => id !== ids[index])) onReorder(next);
      }}
    >
      <div
        role="list"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
        aria-label={tr("Conversation list")}
      >
        {chats.map((chat, index) => (
          <ConversationRow
            key={chat.id}
            chat={chat}
            index={index}
            selected={chat.id === selectedId}
            pending={pending}
            onSelect={() => onSelect(chat.id)}
            moveUp={index > 0 && !pending ? () => shift(index, -1) : undefined}
            moveDown={
              index < chats.length - 1 && !pending
                ? () => shift(index, 1)
                : undefined
            }
          />
        ))}
        {!chats.length && (
          <p className="px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
            {tr("No conversations yet")}
          </p>
        )}
      </div>
    </DragDropProvider>
  );
}

function ConversationRow({
  chat,
  index,
  selected,
  pending,
  onSelect,
  moveUp,
  moveDown,
}: {
  chat: AgentChatSummary;
  index: number;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
}) {
  const { ref, handleRef, isDragging, isDropping } = useSortable({
    id: chat.id,
    index,
    type: "agent-chat",
    group: "agent-chats",
    disabled: pending,
  });
  return (
    <div
      ref={ref}
      role="listitem"
      data-chat-id={chat.id}
      data-dragging={isDragging}
      className={cn(
        "group flex items-center gap-1 rounded-lg border border-transparent pr-2 transition-colors",
        selected ? "border-border bg-muted" : "hover:bg-muted/50",
        isDragging && "z-50 border-primary/40 bg-background shadow-lg",
      )}
    >
      <Button
        ref={handleRef}
        type="button"
        variant="ghost"
        className="h-auto min-w-0 flex-1 justify-start gap-2 rounded-lg px-2 py-3 text-left hover:bg-transparent"
        aria-current={selected ? "true" : undefined}
        aria-label={tr("Open conversation {{title}}", {
          title: chat.title || tr("New conversation"),
        })}
        title={tr(
          "Hold for 350 ms to drag, or use Space and arrow keys to reorder",
        )}
        onClick={(event) => {
          if (!event.defaultPrevented && !isDragging && !isDropping) onSelect();
        }}
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            {chat.running && (
              <span
                aria-label={tr("Working…")}
                className="size-2 shrink-0 animate-pulse rounded-full bg-primary"
              />
            )}
            <span className="truncate">
              {chat.title || tr("New conversation")}
            </span>
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {chat.project_name || tr("General")} ·{" "}
            {chat.provider === "codex"
              ? "Codex"
              : chat.provider === "claude"
                ? "Claude Code"
                : "GitHub Copilot"}
          </span>
        </span>
      </Button>
      <ConversationActions
        chat={chat}
        disabled={pending || isDragging || isDropping}
        moveUp={moveUp}
        moveDown={moveDown}
      />
    </div>
  );
}
