import { chatWrites } from "@/api/mutations";
import { reads } from "@/api/queries";
import type { AgentChat, AgentChatUpdate } from "@/api/generated/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { tr } from "@/lib/i18n";
import { createId } from "@/lib/createId";
import { useChatDock } from "@/modules/chat/store";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { providerNames, providers } from "./AgentSettingsDialog";
import { ChatSelect } from "./ChatSelect";
import { ConversationActions } from "./ConversationActions";

export function Conversation({
  chatId,
  readOnly,
  enabled,
  agentSettings,
}: {
  chatId: string;
  readOnly: boolean;
  enabled: boolean;
  agentSettings: () => void;
}) {
  const client = useQueryClient();
  const query = useQuery(reads.agentChat(client, chatId));
  const chat = query.data;
  const state = useChatDock();
  const send = useMutation(chatWrites.send(client, chatId));
  const stop = useMutation(chatWrites.stop(client, chatId));
  const update = useMutation(chatWrites.update(client, chatId));
  const [uncertain, setUncertain] = useState<{
    text: string;
    context: typeof state.context;
    request_id: string;
  } | null>(null);
  const messages = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const draft = state.drafts[chatId] || "";
  const busy =
    !!chat?.running || send.isPending || stop.isPending || update.isPending;
  const saving =
    useIsMutating({
      mutationKey: ["project-edit"],
      predicate: (mutation) =>
        (mutation.state.variables as { projectId?: string } | undefined)
          ?.projectId === chat?.project_id,
    }) > 0;
  const write = (patch: Omit<AgentChatUpdate, "expected_version">) =>
    chat && update.mutate({ expected_version: chat.version, ...patch });
  useEffect(() => {
    if (follow.current && messages.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [chat?.version]);
  function submit(retry = false) {
    if (
      !chat ||
      busy ||
      saving ||
      chat.archived ||
      !enabled ||
      (!retry && !draft.trim())
    )
      return;
    const captured =
      uncertain &&
      (retry ||
        (uncertain.text === draft.trim() &&
          JSON.stringify(uncertain.context) === JSON.stringify(state.context)))
        ? uncertain
        : {
            text: draft.trim(),
            context: state.context,
            request_id: createId(),
          };
    follow.current = true;
    send.mutate(captured, {
      onSuccess: () => {
        setUncertain(null);
        const latest = useChatDock.getState();
        if (latest.drafts[chatId]?.trim() === captured.text)
          latest.set({
            drafts: { ...latest.drafts, [chatId]: "" },
            ...(latest.selectedId === chatId &&
            JSON.stringify(latest.context) === JSON.stringify(captured.context)
              ? { context: null }
              : {}),
          });
      },
      onError: () => setUncertain(captured),
    });
  }
  if (!chat)
    return (
      <div className="p-4" role={query.error ? "alert" : "status"}>
        {query.error?.message || tr("Loading conversation…")}
        <Button variant="ghost" onClick={() => void query.refetch()}>
          {tr("Try again")}
        </Button>
      </div>
    );
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="space-y-4 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {chat.title || tr("New conversation")}
          </h3>
          <ConversationActions chat={chat} disabled={busy} />
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {chat.project_id ? (
            <Link
              className="min-w-0 truncate text-[var(--brand-ink)] underline-offset-4 hover:underline"
              to="/projects/$projectId"
              params={{ projectId: chat.project_id }}
            >
              {chat.project_name}
            </Link>
          ) : (
            <span>{tr("General")}</span>
          )}
          {chat.archived && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-1">
              {tr("Archived")}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ChatSelect
            label={tr("Agent")}
            value={chat.provider}
            disabled={busy || chat.archived}
            onValueChange={(value) =>
              write({ provider: value as AgentChat["provider"] })
            }
            options={providers.map((provider) => ({
              value: provider,
              label: providerNames[provider],
            }))}
          />
          <ChatSelect
            label={tr("Agent mode")}
            value={readOnly ? "ask" : chat.mode}
            disabled={busy || chat.archived}
            onValueChange={(value) =>
              write({ mode: value as AgentChat["mode"] })
            }
            options={[
              { value: "ask", label: tr("Ask") },
              {
                value: "edit",
                label: tr("Edit project"),
                disabled: readOnly || !chat.project_id,
              },
            ]}
          />
        </div>
        {chat.mode === "edit" && !readOnly && (
          <p className="text-xs text-muted-foreground">
            {tr(
              "Edits are saved to project history. Stop preserves completed edits.",
            )}
          </p>
        )}
      </header>
      <div
        ref={messages}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6"
        aria-label={tr("Conversation messages")}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={(event) => {
          const element = event.currentTarget;
          follow.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            48;
        }}
      >
        {!chat.messages.length && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {tr(
              "Ask about your project, script or timeline. Choose Edit project to request changes.",
            )}
          </p>
        )}
        {chat.messages.map((message) => (
          <article
            key={message.id}
            className={`space-y-3 rounded-lg p-4 text-sm leading-relaxed ${message.role === "user" ? "bg-muted" : "border"}`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {message.role === "user"
                  ? tr("You")
                  : providerNames[message.provider]}
              </span>
              <span>
                {tr(
                  {
                    running: "Working…",
                    complete: "Complete",
                    failed: "Failed",
                    cancelled: "Stopped",
                  }[message.status],
                )}
              </span>
            </div>
            {message.context && (
              <p className="text-xs text-muted-foreground">
                {tr("Context")}:{" "}
                {message.context.label || message.context.target_id}
              </p>
            )}
            {message.reasoning && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {tr("Reasoning summary")}
                </summary>
                <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">
                  {message.reasoning}
                </p>
              </details>
            )}
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
            {message.progress && (
              <p role="status" className="text-xs text-muted-foreground">
                {message.progress === "Starting agent"
                  ? tr("Starting agent")
                  : message.progress}
              </p>
            )}
            {message.applied_revisions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {tr("Saved project revisions: {{revisions}}", {
                  revisions: message.applied_revisions.join(", "),
                })}
              </p>
            )}
            {message.error && (
              <div role="alert" className="text-destructive">
                <p className="whitespace-pre-wrap break-words">
                  {message.error}
                </p>
                <Button size="sm" variant="ghost" onClick={agentSettings}>
                  {tr("Agent settings")}
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      <form
        className="space-y-3 border-t px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {state.context && (
          <div className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {tr("Context")}: {state.context.label || state.context.target_id}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={tr("Remove context")}
              onClick={() => state.set({ context: null })}
            >
              <X />
            </Button>
          </div>
        )}
        {query.error && (
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
        )}
        {(send.error || stop.error || update.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(send.error || stop.error || update.error)?.message}
          </p>
        )}
        {uncertain && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => submit(true)}
          >
            {tr("Retry the same message")}
          </Button>
        )}
        <Textarea
          aria-label={tr("Message to agent")}
          placeholder={tr(
            chat.archived
              ? "Restore this conversation to continue"
              : "Ask your agent…",
          )}
          value={draft}
          maxLength={20000}
          disabled={chat.archived || !enabled}
          className="min-h-24 max-h-48 resize-y p-3 leading-relaxed"
          onChange={(event) =>
            state.set({
              drafts: { ...state.drafts, [chatId]: event.target.value },
            })
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {saving
              ? tr("Saving project…")
              : tr("Enter to send · Shift+Enter for a new line")}
          </span>
          {chat.running ? (
            <Button
              type="button"
              variant="outline"
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
            >
              <Square />
              {tr("Stop")}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={
                busy || saving || !draft.trim() || chat.archived || !enabled
              }
            >
              {tr(send.isPending ? "Sending…" : "Send")}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
