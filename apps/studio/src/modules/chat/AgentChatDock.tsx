import { chatWrites } from "@/api/mutations";
import { reads } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tr, useLocale } from "@/lib/i18n";
import { useChatDock } from "@/modules/chat/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { List, MessageSquare, Plus, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AgentSettingsDialog } from "./AgentSettingsDialog";
import { Conversation } from "./Conversation";
import { ChatSelect } from "./ChatSelect";
import { ConversationList } from "./ConversationList";

export function AgentChatDock() {
  useLocale();
  const state = useChatDock();
  if (!state.open)
    return (
      <Button
        className="fixed right-4 bottom-4 z-40 shadow-lg"
        onClick={() => state.set({ open: true })}
      >
        <MessageSquare />
        {tr("Agent chat")}
      </Button>
    );
  return <ChatPanel />;
}

function ChatPanel() {
  const client = useQueryClient();
  const path = useRouterState({ select: (router) => router.location.pathname });
  const currentProject = path.match(/^\/projects\/([^/]+)/)?.[1] || null;
  const state = useChatDock();
  const settings = useQuery(reads.agentSettings(client));
  const chats = useQuery(reads.agentChats(client));
  const projects = useQuery(reads.projects(client));
  const create = useMutation(chatWrites.create(client));
  const order = useMutation(chatWrites.order(client));
  const [scope, setScope] = useState(currentProject || "general");
  const [filter, setFilter] = useState("all");
  const [archived, setArchived] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showList, setShowList] = useState(false);
  const handling = useRef<number | null>(null);
  const selected = chats.data?.find((chat) => chat.id === state.selectedId);
  const visible =
    chats.data?.filter(
      (chat) =>
        chat.archived === archived &&
        (filter === "all" ||
          (filter === "general"
            ? !chat.project_id
            : chat.project_id === filter)),
    ) || [];
  function select(id: string) {
    state.set({ selectedId: id, context: null });
    setShowList(false);
  }
  function newChat() {
    create.mutate(
      { project_id: scope === "general" ? null : scope },
      {
        onSuccess: (chat) => {
          setArchived(false);
          setFilter("all");
          select(chat.id);
        },
      },
    );
  }
  useEffect(() => {
    const reference = state.reference;
    if (
      !reference ||
      !settings.data ||
      !chats.data ||
      handling.current === reference.nonce
    )
      return;
    handling.current = reference.nonce;
    const reusable = chats.data?.find(
      (chat) =>
        chat.id === state.selectedId &&
        chat.project_id === reference.projectId &&
        !chat.running &&
        !chat.archived,
    );
    if (reusable) {
      state.set({ context: reference.context, reference: null });
      return;
    }
    create.mutate(
      { project_id: reference.projectId, context: reference.context },
      {
        onSuccess: (chat) => {
          setArchived(false);
          setFilter("all");
          setShowList(false);
          state.set({
            selectedId: chat.id,
            context: reference.context,
            reference: null,
          });
        },
        onError: () => state.set({ reference: null }),
      },
    );
  }, [
    state.reference,
    state.selectedId,
    chats.data,
    settings.data,
    create.mutate,
    state.set,
  ]);
  return (
    <aside
      aria-label={tr("Agent chat")}
      className="fixed inset-y-4 right-4 z-40 flex w-[min(1024px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
    >
      <header className="flex items-center gap-3 border-b px-5 py-4">
        <MessageSquare className="size-4" />
        <h2 className="flex-1 text-sm font-semibold">{tr("Agent chat")}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          className="sm:hidden"
          aria-label={tr("Conversations")}
          aria-pressed={showList}
          onClick={() => setShowList((value) => !value)}
        >
          <List />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!settings.data}
          aria-label={tr("Agent settings")}
          onClick={() => setShowSettings(true)}
        >
          <Settings2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tr("Close chat")}
          onClick={() => state.set({ open: false })}
        >
          <X />
        </Button>
      </header>
      {(settings.error || chats.error || projects.error) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b px-5 py-3 text-sm text-destructive"
        >
          {(settings.error || chats.error || projects.error)?.message}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void settings.refetch();
              void chats.refetch();
              void projects.refetch();
            }}
          >
            {tr("Try again")}
          </Button>
        </div>
      )}
      {settings.data && !settings.data.enabled && (
        <p role="status" className="border-b px-5 py-3 text-sm">
          {tr("Local agent chat is disabled on this server.")}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={tr("Conversations")}
          className={cn(
            "min-h-0 w-full shrink-0 flex-col border-r sm:flex sm:w-64 lg:w-72",
            state.selectedId && !showList ? "hidden" : "flex",
          )}
        >
          <div className="space-y-4 border-b p-4">
            <ChatSelect
              label={tr("New conversation scope")}
              value={scope}
              onValueChange={setScope}
              disabled={create.isPending || order.isPending}
              options={[
                { value: "general", label: tr("General") },
                ...(projects.data
                  ?.filter((project) => !project.id.startsWith("pending:"))
                  .map((project) => ({
                    value: project.id,
                    label: project.name,
                  })) || []),
              ]}
            />
            <Button
              variant="outline"
              className="h-9 w-full"
              disabled={
                create.isPending || order.isPending || !settings.data?.enabled
              }
              onClick={newChat}
            >
              <Plus />
              {tr("New conversation")}
            </Button>
            <ChatSelect
              label={tr("Filter conversations")}
              value={filter}
              onValueChange={setFilter}
              disabled={order.isPending}
              options={[
                { value: "all", label: tr("All projects") },
                { value: "general", label: tr("General") },
                ...(projects.data?.map((project) => ({
                  value: project.id,
                  label: project.name,
                })) || []),
              ]}
            />
            <Tabs
              value={archived ? "archive" : "active"}
              onValueChange={(value) => setArchived(value === "archive")}
            >
              <TabsList className="h-9 w-full">
                <TabsTrigger value="active" disabled={order.isPending}>
                  {tr("Active")}
                </TabsTrigger>
                <TabsTrigger value="archive" disabled={order.isPending}>
                  {tr("Archive")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {(create.error || order.error) && (
            <p role="alert" className="px-4 pt-3 text-xs text-destructive">
              {(create.error || order.error)?.message}
            </p>
          )}
          <ConversationList
            chats={visible}
            selectedId={state.selectedId}
            pending={order.isPending}
            onSelect={select}
            onReorder={(ids) => order.mutate({ chat_ids: ids })}
          />
          {!!visible.length && (
            <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              {tr("Hold for 350 ms to reorder conversations")}
            </p>
          )}
        </nav>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 sm:flex",
            showList || !state.selectedId ? "hidden" : "flex",
          )}
        >
          {state.selectedId ? (
            <Conversation
              key={state.selectedId}
              chatId={state.selectedId}
              readOnly={settings.data?.read_only || false}
              enabled={settings.data?.enabled || false}
              agentSettings={() => setShowSettings(true)}
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {tr("Start a conversation or select one from the list.")}
            </div>
          )}
        </div>
      </div>
      {selected?.project_id && selected.project_id !== currentProject && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {tr("This conversation stays linked to {{project}}.", {
            project: selected.project_name,
          })}
        </p>
      )}
      {showSettings && settings.data && (
        <AgentSettingsDialog
          snapshot={settings.data}
          onClose={() => setShowSettings(false)}
        />
      )}
    </aside>
  );
}
