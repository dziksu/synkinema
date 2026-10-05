import {
  optimistic,
  updateConfirmed,
  type OptimisticContext,
} from "@/api/cache";
import { chatSummary, newerChat } from "@/api/chatCache";
import type {
  AgentChat,
  AgentChatCreate,
  AgentChatOrder,
  AgentChatSummary,
  AgentChatUpdate,
  AgentSend,
  AgentSettingsSnapshot,
  AgentSettingsUpdate,
} from "@/api/generated/client";
import { keys } from "@/api/queries";
import { http } from "@/api/transport";
import { mutationOptions, type QueryClient } from "@tanstack/react-query";

function accept(client: QueryClient, next: AgentChat) {
  const previous = client.getQueryData<AgentChat>(keys.agentChat(next.id));
  const changed = next.messages
    .flatMap((message) => message.applied_revisions)
    .some(
      (revision) =>
        !previous?.messages.some((message) =>
          message.applied_revisions.includes(revision),
        ),
    );
  updateConfirmed<AgentChat>(client, keys.agentChat(next.id), (old) =>
    newerChat(old, next),
  );
  updateConfirmed<AgentChatSummary[]>(client, keys.agentChats, (old = []) =>
    old.some((chat) => chat.id === next.id)
      ? old.map((chat) =>
          chat.id === next.id ? newerChat(chat, chatSummary(next)) : chat,
        )
      : [chatSummary(next), ...old],
  );
  if (changed && next.project_id) {
    for (const queryKey of [
      keys.projects,
      keys.project(next.project_id),
      keys.history(next.project_id),
      keys.assets(next.project_id),
      ["server-state"],
    ])
      void client.invalidateQueries({ queryKey });
  }
}
async function refresh(client: QueryClient, chatId?: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.agentChats }),
    ...(chatId
      ? [client.invalidateQueries({ queryKey: keys.agentChat(chatId) })]
      : []),
  ]);
}
export const chatWrites = {
  create: (client: QueryClient) =>
    mutationOptions({
      mutationFn: (request: AgentChatCreate) =>
        http.api.createAgentChat(request),
      retry: false,
      onSuccess: (chat: AgentChat) => accept(client, chat),
      onSettled: () => refresh(client),
    }),
  update: (client: QueryClient, chatId: string) =>
    mutationOptions({
      mutationFn: (request: AgentChatUpdate) =>
        http.api.updateAgentChat(encodeURIComponent(chatId), request),
      scope: { id: `agent-chat:${chatId}` },
      retry: false,
      onMutate: (request: AgentChatUpdate) => {
        const { expected_version: _version, ...patch } = request;
        const apply = <T extends AgentChatSummary>(chat: T): T => ({
          ...chat,
          ...Object.fromEntries(
            Object.entries(patch).filter(([, value]) => value != null),
          ),
        });
        return optimistic(client, [
          {
            key: keys.agentChat(chatId),
            apply: (old: AgentChat | undefined) => old && apply(old),
          },
          {
            key: keys.agentChats,
            apply: (old: AgentChatSummary[] = []) =>
              old.map((chat) => (chat.id === chatId ? apply(chat) : chat)),
          },
        ]);
      },
      onSuccess: (
        chat: AgentChat,
        _request: AgentChatUpdate,
        context: OptimisticContext,
      ) => {
        context.settle(true, (key, old) =>
          key[0] === "agent-chat"
            ? newerChat(old, chat)
            : (old || []).map((item: AgentChatSummary) =>
                item.id === chat.id ? newerChat(item, chatSummary(chat)) : item,
              ),
        );
      },
      onError: (
        _error: Error,
        _request: AgentChatUpdate,
        context: OptimisticContext | undefined,
      ) => context?.settle(false),
      onSettled: () => refresh(client, chatId),
    }),
  send: (client: QueryClient, chatId: string) =>
    mutationOptions({
      mutationFn: (request: AgentSend) =>
        http.api.sendAgentMessage(encodeURIComponent(chatId), request),
      retry: false,
      onSuccess: (chat: AgentChat) => accept(client, chat),
      onSettled: () => refresh(client, chatId),
    }),
  stop: (client: QueryClient, chatId: string) =>
    mutationOptions({
      mutationFn: () => http.api.stopAgentChat(encodeURIComponent(chatId)),
      retry: false,
      onSuccess: (chat: AgentChat) => accept(client, chat),
      onSettled: () => refresh(client, chatId),
    }),
  delete: (client: QueryClient, chatId: string) =>
    mutationOptions({
      mutationFn: (version: number) =>
        http.api.deleteAgentChat(encodeURIComponent(chatId), {
          expected_version: version,
        }),
      retry: false,
      onSuccess: async () => {
        await client.cancelQueries({ queryKey: keys.agentChat(chatId) });
        client.removeQueries({ queryKey: keys.agentChat(chatId) });
        updateConfirmed<AgentChatSummary[]>(
          client,
          keys.agentChats,
          (old = []) => old.filter((chat) => chat.id !== chatId),
        );
      },
      onSettled: () => refresh(client),
    }),
  order: (client: QueryClient) =>
    mutationOptions({
      mutationFn: (request: AgentChatOrder) =>
        http.api.orderAgentChats(request),
      scope: { id: "agent-chat-order" },
      retry: false,
      onMutate: (request: AgentChatOrder) =>
        optimistic(client, [
          {
            key: keys.agentChats,
            apply: (old: AgentChatSummary[] = []) => {
              const selected = new Set(request.chat_ids);
              const replacements = request.chat_ids.map(
                (id) => old.find((chat) => chat.id === id)!,
              );
              let index = 0;
              return old.map((chat) =>
                selected.has(chat.id) ? replacements[index++] : chat,
              );
            },
          },
        ]),
      onSuccess: (
        chats: AgentChatSummary[],
        _request: AgentChatOrder,
        context: OptimisticContext,
      ) => context.settle(true, () => chats),
      onError: (
        _error: Error,
        _request: AgentChatOrder,
        context: OptimisticContext | undefined,
      ) => context?.settle(false),
      onSettled: () => refresh(client),
    }),
  settings: (client: QueryClient) =>
    mutationOptions({
      mutationFn: (request: AgentSettingsUpdate) =>
        http.api.updateAgentChatSettings(request),
      scope: { id: "agent-settings" },
      retry: false,
      onMutate: (request: AgentSettingsUpdate) =>
        optimistic(client, [
          {
            key: keys.agentSettings,
            apply: (old: AgentSettingsSnapshot | undefined) =>
              old && { ...old, settings: request.settings },
          },
        ]),
      onSuccess: (
        snapshot: AgentSettingsSnapshot,
        _request: AgentSettingsUpdate,
        context: OptimisticContext,
      ) => context.settle(true, () => snapshot),
      onError: (
        _error: Error,
        _request: AgentSettingsUpdate,
        context: OptimisticContext | undefined,
      ) => context?.settle(false),
      onSettled: async () => {
        await client.cancelQueries({ queryKey: ["agent-models"] });
        await Promise.all([
          client.invalidateQueries({ queryKey: keys.agentSettings }),
          client.invalidateQueries({ queryKey: ["agent-models"] }),
        ]);
      },
    }),
};
