import type { AgentChat, AgentChatSummary } from "@/api/generated/client";

/** A delayed POST/GET acknowledgement must never rewind streamed/polled state. */
export function newerChat<T extends AgentChatSummary>(
  old: T | undefined,
  next: T,
): T {
  return old && old.version > next.version ? old : next;
}

export function chatSummary(chat: AgentChat): AgentChatSummary {
  const { messages: _messages, ...summary } = chat;
  return summary;
}
