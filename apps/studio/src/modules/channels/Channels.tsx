import { reads } from "@/api/queries";
import PageHeader from "@/components/PageHeader";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import ChannelAvatar from "@/modules/channels/ChannelAvatar";
import { platformNames } from "@/modules/channels/ChannelLinksEditor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChannelForm } from "./ChannelForm";
import { ChannelWorkspace } from "./ChannelWorkspace";

export default function Channels({
  channelId,
  onSelect,
  onProject,
  onNewProject,
}: {
  channelId: string | null;
  onSelect: (id: string | null) => void;
  onProject: (id: string) => void;
  onNewProject: (channelId: string) => void;
}) {
  const client = useQueryClient();
  const channels = useQuery(reads.channels(client));
  const detail = useQuery(reads.channel(client, channelId));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const pageTop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageTop.current?.scrollIntoView?.({ block: "start" });
  }, [creating, editing, channelId]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const visibleChannels = (channels.data || []).filter(
    (channel) =>
      (showArchived || !channel.archived) &&
      channel.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div ref={pageTop} />
      <PageHeader
        eyebrow={tr("CONSISTENT STORIES. SHARED CONTEXT.")}
        title={tr("Channels")}
        description={tr(
          "Editorial direction for people and agents. No account connections or auto-publishing.",
        )}
        action={
          !channelId && !creating && !editing ? (
            <Button
              variant="default"
              className="button primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={17} />
              {tr("New channel")}
            </Button>
          ) : undefined
        }
      />
      <section className="content-page channels-page">
        <nav className="channel-breadcrumbs" aria-label={tr("Breadcrumb")}>
          <ol>
            <li>
              {channelId || creating ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditing(false);
                    onSelect(null);
                  }}
                >
                  {tr("Channels")}
                </button>
              ) : (
                <span aria-current="page">{tr("Channels")}</span>
              )}
            </li>
            {channelId && !creating && (
              <li>
                <span aria-hidden="true">/</span>
                {editing ? (
                  <button type="button" onClick={() => setEditing(false)}>
                    {detail.data?.channel.name || tr("Loading…")}
                  </button>
                ) : (
                  <span aria-current="page">
                    {detail.data?.channel.name || tr("Loading…")}
                  </span>
                )}
              </li>
            )}
            {(creating || editing) && (
              <li>
                <span aria-hidden="true">/</span>
                <span aria-current="page">
                  {creating ? tr("New channel") : tr("Edit channel brief")}
                </span>
              </li>
            )}
          </ol>
        </nav>
        {(channels.error || detail.error) && (
          <div role="alert" className="error-banner">
            {(channels.error || detail.error)?.message}
            <Button
              variant="outline"
              className="button"
              onClick={() => {
                void channels.refetch();
                if (channelId) void detail.refetch();
              }}
            >
              {tr("Try again")}
            </Button>
          </div>
        )}
        {creating ? (
          <ChannelForm
            onCancel={() => setCreating(false)}
            onSaved={(c) => {
              setCreating(false);
              onSelect(c.id);
            }}
          />
        ) : channelId ? (
          detail.data ? (
            <ChannelWorkspace
              key={channelId}
              editing={editing}
              onEditingChange={setEditing}
              detail={detail.data}
              onProject={onProject}
              onNewProject={() => onNewProject(channelId)}
            />
          ) : (
            <p>{detail.isPending ? tr("Loading…") : tr("Channel not found")}</p>
          )
        ) : (
          <>
            {!!channels.data?.length && (
              <div className="channel-list-toolbar">
                <div className="channel-filters">
                  <SearchField
                    aria-label={tr("Search channels")}
                    placeholder={tr("Search channels")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <label className="channel-filter-check">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />
                    <span>{tr("Show archived channels")}</span>
                  </label>
                </div>
                <span className="channel-result-count" role="status">
                  {visibleChannels.length === 1
                    ? tr("1 channel shown")
                    : tr("{{count}} channels shown", {
                        count: visibleChannels.length,
                      })}
                </span>
              </div>
            )}
            {channels.isPending && <p>{tr("Loading…")}</p>}
            {!channels.isPending && !channels.data?.length && (
              <div className="channel-empty">
                <Radio size={32} />
                <h2>{tr("Give every video a clear direction")}</h2>
                <p>
                  {tr(
                    "Add your audience, language, voice and creative rules once. Linked projects carry that context into MCP.",
                  )}
                </p>
              </div>
            )}
            {!!channels.data?.length && !visibleChannels.length && (
              <div className="channel-empty channel-no-results">
                <h2>{tr("No channels match these filters")}</h2>
                <p>{tr("Try another name or include archived channels.")}</p>
              </div>
            )}
            <div className="channel-grid">
              {visibleChannels.map((c) => (
                <button
                  className="channel-card"
                  key={c.id}
                  onClick={() => {
                    setEditing(false);
                    onSelect(c.id);
                  }}
                >
                  <div className="channel-card-top">
                    <ChannelAvatar name={c.name} logoId={c.logo_id} large />
                    <span className="channel-card-meta">
                      <span>{c.language.toUpperCase()}</span>
                      <span>
                        {tr("Version {{version}}", { version: c.version })}
                      </span>
                      {c.archived && <span>{tr("Archived")}</span>}
                    </span>
                  </div>
                  <h2>{c.name}</h2>
                  <p>{c.concept || c.audience || tr("No concept yet")}</p>
                  <footer>
                    <span>
                      {[
                        ...new Set(
                          c.links.map((l) => platformNames[l.platform]),
                        ),
                      ].join(" · ") || tr("No platform links")}
                    </span>
                    <ArrowRight size={18} />
                  </footer>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
