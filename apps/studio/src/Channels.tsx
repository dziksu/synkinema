import { useState, useRef, useEffect, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, Plus, Radio, Unlink } from "lucide-react";
import { reads } from "./api/queries";
import { writes } from "./api/mutations";
import ChannelLinksEditor, {
  platformNames,
  platforms,
  channelLinkLabel,
} from "./ChannelLinksEditor";
import ChannelProjectLinker from "./ChannelProjectLinker";
import ChannelProjectUnlinker from "./ChannelProjectUnlinker";
import ChannelAvatar from "./ChannelAvatar";
import PageHeader from "./PageHeader";
import { Field, FieldLabel, FieldDescription } from "./components/ui/field";
import { Textarea } from "./components/ui/textarea";
import type {
  Channel,
  ChannelDetail,
  ChannelInput,
  ChannelLink,
  ChannelReviewWrite,
  Publication,
  PublicationWrite,
} from "./api/generated/client";
import { tr } from "./i18n";
import AgentPromptCopyButton from "./AgentPromptCopyButton";
import { channelAgentPrompt } from "./agentPrompts";
import "./channels.css";

export function ChannelSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const query = useQuery(reads.channels(client));
  return (
    <label className="field">
      {tr("Editorial channel")}
      <select
        value={value}
        disabled={disabled || query.isPending || query.isError}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{tr("Independent project (no channel)")}</option>
        {(query.data || [])
          .filter((c) => !c.archived || c.id === value)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.archived ? ` · ${tr("Archived")}` : ""}
            </option>
          ))}
      </select>
      {query.error && <span role="alert">{query.error.message}</span>}
    </label>
  );
}

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
            <button
              className="button primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={17} />
              {tr("New channel")}
            </button>
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
            <button
              className="button"
              onClick={() => {
                void channels.refetch();
                if (channelId) void detail.refetch();
              }}
            >
              {tr("Try again")}
            </button>
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
                  <input
                    type="search"
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

function ChannelWorkspace({
  editing,
  onEditingChange,
  detail,
  onProject,
  onNewProject,
}: {
  detail: ChannelDetail;
  editing: boolean;
  onEditingChange: (value: boolean) => void;
  onProject: (id: string) => void;
  onNewProject: () => void;
}) {
  const [tab, setTab] = useState<"brief" | "publications" | "reviews">("brief");
  const [notice, setNotice] = useState("");
  const setEditing = onEditingChange;
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [publication, setPublication] = useState<Publication | "new" | null>(
    null,
  );
  const [reviewing, setReviewing] = useState(false);
  const c = detail.channel;
  const tabIds = ["brief", "publications", "reviews"] as const;
  if (editing)
    return (
      <ChannelForm
        channel={c}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  return (
    <>
      <div className="channel-identity">
        <div className="channel-identity-main">
          <ChannelAvatar name={c.name} logoId={c.logo_id} large />
          <div className="channel-identity-copy">
            <h2>{c.name}</h2>
            <p className="channel-identity-meta">
              <span>{c.language.toUpperCase()}</span>
              <span>{tr("Version {{version}}", { version: c.version })}</span>
              {c.archived && <span>{tr("Archived")}</span>}
            </p>
            {!!c.links.length && (
              <div className="channel-links">
                {c.links.map((link, i) => (
                  <a
                    key={`${link.url}-${i}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="button subtle"
                  >
                    {channelLinkLabel(link)}
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="channel-identity-actions">
          <AgentPromptCopyButton
            prompt={channelAgentPrompt(c)}
            onNotice={setNotice}
            label={tr("Copy channel agent prompt")}
          />
          <button className="button" onClick={() => setEditing(true)}>
            {tr("Edit channel brief")}
          </button>
        </div>
      </div>
      {notice && (
        <p className="channel-help" role="status">
          {notice}
        </p>
      )}
      <div
        className="channel-tabs"
        role="tablist"
        aria-label={tr("Channel sections")}
      >
        {(
          [
            ["brief", tr("Direction")],
            ["publications", tr("Published videos")],
            ["reviews", tr("Reviews and learning")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            id={`channel-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={tab === id ? `channel-panel-${id}` : undefined}
            tabIndex={tab === id ? 0 : -1}
            className={`button ${tab === id ? "primary" : "subtle"}`}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const index = tabIds.indexOf(id);
              const next =
                event.key === "ArrowRight"
                  ? tabIds[(index + 1) % tabIds.length]
                  : event.key === "ArrowLeft"
                    ? tabIds[(index - 1 + tabIds.length) % tabIds.length]
                    : event.key === "Home"
                      ? tabIds[0]
                      : event.key === "End"
                        ? tabIds[tabIds.length - 1]
                        : null;
              if (next) {
                event.preventDefault();
                setTab(next);
                document.getElementById(`channel-tab-${next}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "brief" && (
        <div
          className="channel-layout"
          id="channel-panel-brief"
          role="tabpanel"
          aria-labelledby="channel-tab-brief"
        >
          <article className="setting-card channel-brief">
            <h3>{tr("Channel direction")}</h3>
            <div className="channel-brief-grid">
              {[
                [tr("Concept"), c.concept],
                [tr("Audience"), c.audience],
                [
                  tr("Voice and tone"),
                  [c.voice_gender, c.voice_provider, c.voice_id, c.tone]
                    .filter(Boolean)
                    .join(" · "),
                ],
                [tr("Opening hooks"), c.hook_guidance],
                [tr("Closing CTA"), c.cta_guidance],
                [tr("Visual and pacing rules"), c.visual_guidance],
                [tr("Standing editorial rules"), c.rules],
                [tr("Avoid"), c.avoid],
                [tr("Approved lessons"), c.learnings],
              ].map(([label, text]) => (
                <div className="channel-brief-field" key={label}>
                  <h4>{label}</h4>
                  <p>{text || "—"}</p>
                </div>
              ))}
            </div>
            <p className="channel-hashtag-rule">
              {c.lowercase_hashtags
                ? tr("Use lowercase hashtags")
                : tr("Hashtag case is unrestricted")}
            </p>
            <p className="channel-help">
              {tr(
                "MCP project details include live channel rules and the five latest reviews. Voice preferences guide production; they do not silently change audio or provider settings.",
              )}
            </p>
          </article>
          <aside className="setting-card">
            <div className="channel-section-title">
              <div>
                <h3>{tr("Linked projects")}</h3>
                <span className="channel-section-count">
                  {detail.projects.length}
                </span>
              </div>
            </div>
            <p>
              {tr(
                "Link a project you already have, or create a new project with this channel’s rules.",
              )}
            </p>
            <div className="channel-project-actions">
              <button
                className="button primary"
                disabled={c.archived}
                onClick={() => setLinking(true)}
              >
                <Plus size={16} />
                {tr("Link existing project")}
              </button>
              <button
                className="button"
                onClick={onNewProject}
                disabled={c.archived}
              >
                <Plus size={15} />
                {tr("Create new project")}
              </button>
            </div>
            {linking && (
              <ChannelProjectLinker
                channel={c}
                onClose={() => setLinking(false)}
              />
            )}
            {!detail.projects.length && (
              <p className="channel-inline-empty">
                {tr("No linked projects yet")}
              </p>
            )}
            <div className="channel-projects">
              {detail.projects.map((p) => (
                <div
                  className="channel-project-row"
                  key={p.id}
                  role="group"
                  aria-label={p.name}
                >
                  <button
                    className="channel-project-open"
                    onClick={() => onProject(p.id)}
                  >
                    <span>
                      {p.name}
                      <small>
                        r{p.revision} · {(p.duration_ms / 1000).toFixed(1)} s
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                  <button
                    className="button subtle channel-project-unlink"
                    onClick={() => setUnlinking({ id: p.id, name: p.name })}
                  >
                    <Unlink size={14} />
                    {tr("Unlink project")}
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
      {unlinking && (
        <ChannelProjectUnlinker
          channelId={c.id}
          project={unlinking}
          onClose={() => setUnlinking(null)}
        />
      )}
      {tab === "publications" && (
        <section
          className="setting-card channel-publications"
          id="channel-panel-publications"
          role="tabpanel"
          aria-labelledby="channel-tab-publications"
        >
          <div className="channel-section-title">
            <h3>{tr("Published videos")}</h3>
            <button className="button" onClick={() => setPublication("new")}>
              <Plus size={16} />
              {tr("Record publication")}
            </button>
          </div>
          <p>
            {tr(
              "Manual records only. Unknown metrics stay blank; compare videos at similar ages and on the same platform.",
            )}
          </p>
          {publication && (
            <PublicationForm
              key={typeof publication === "string" ? "new" : publication.id}
              detail={detail}
              initial={
                typeof publication === "string" ? undefined : publication
              }
              onClose={() => setPublication(null)}
            />
          )}
          {!detail.publications.length && (
            <p>{tr("No publications recorded")}</p>
          )}
          {!!detail.publications.length && (
            <div className="channel-table-wrap">
              <table className="channel-table">
                <thead>
                  <tr>
                    {[
                      tr("Video"),
                      tr("Status"),
                      tr("Views"),
                      tr("Likes / comments"),
                      tr("Average viewed"),
                      tr("Observed at"),
                      tr("Actions"),
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.publications.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.title}
                          <ExternalLink size={12} />
                        </a>
                        <small>
                          {platformNames[p.platform]}
                          {p.published_at
                            ? ` · ${new Date(p.published_at).toLocaleString()}`
                            : ""}
                        </small>
                        {p.project_id &&
                          detail.projects.some(
                            (linked) => linked.id === p.project_id,
                          ) && (
                            <button
                              className="button subtle"
                              onClick={() => onProject(p.project_id!)}
                            >
                              {tr("Open project")}
                            </button>
                          )}
                        {!!p.evidence && (
                          <details className="channel-evidence">
                            <summary>
                              {tr("Source and observation notes")}
                            </summary>
                            <p>{p.evidence}</p>
                          </details>
                        )}
                      </td>
                      <td>
                        <span
                          className={`channel-status channel-status-${p.status}`}
                        >
                          {p.status === "published"
                            ? tr("Published")
                            : p.status === "scheduled"
                              ? tr("Scheduled")
                              : tr("Draft")}
                        </span>
                      </td>
                      <td className="channel-number">
                        {p.views?.toLocaleString() ?? "—"}
                      </td>
                      <td className="channel-engagement">
                        <span>
                          {tr("Likes")}: {p.likes?.toLocaleString() ?? "—"}
                        </span>
                        <span>
                          {tr("Comments")}:{" "}
                          {p.comments?.toLocaleString() ?? "—"}
                        </span>
                      </td>
                      <td className="channel-number">
                        {p.average_viewed_percent == null
                          ? "—"
                          : `${p.average_viewed_percent}%`}
                      </td>
                      <td className="channel-observed-at">
                        {p.metrics_as_of ? (
                          <time dateTime={p.metrics_as_of}>
                            {new Date(p.metrics_as_of).toLocaleDateString()}
                            <small>
                              {new Date(p.metrics_as_of).toLocaleTimeString(
                                undefined,
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </small>
                          </time>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <button
                          className="button channel-edit-record"
                          onClick={() => setPublication(p)}
                        >
                          {tr("Edit record")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === "reviews" && (
        <section
          className="setting-card channel-reviews"
          id="channel-panel-reviews"
          role="tabpanel"
          aria-labelledby="channel-tab-reviews"
        >
          <div className="channel-section-title">
            <h3>{tr("Reviews and learning")}</h3>
            <button
              className="button"
              disabled={!detail.projects.length}
              onClick={() => setReviewing(true)}
            >
              <Plus size={16} />
              {tr("Add editorial review")}
            </button>
          </div>
          <p>
            {tr(
              "Subjective editorial score, not a virality prediction. Five criteria, 0–10 each: hook, pacing, clarity, CTA and channel fit. Overall score is their mean × 10.",
            )}
          </p>
          <p className="channel-help">
            {tr(
              "Agents can inspect a project or render, then use record_channel_review with evidence. Promote useful findings to Approved lessons yourself; reviews never rewrite your rules automatically.",
            )}
          </p>
          {reviewing && (
            <ReviewForm detail={detail} onClose={() => setReviewing(false)} />
          )}
          {!detail.reviews.length && <p>{tr("No reviews yet")}</p>}
          {detail.reviews.map((r) => (
            <article className="channel-review" key={r.id}>
              <div className="channel-review-heading">
                <strong className="channel-review-score">
                  {tr("{{score}}/100", { score: r.score })}
                </strong>
                <div>
                  <h4>
                    {detail.projects.find((p) => p.id === r.project_id)?.name ||
                      r.project_id}
                  </h4>
                  <small>
                    r{r.project_revision} · {r.author} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </small>
                </div>
              </div>
              <div className="channel-review-criteria">
                {[
                  [tr("Hook"), r.hook],
                  [tr("Pacing"), r.pacing],
                  [tr("Clarity"), r.clarity],
                  [tr("Closing CTA"), r.cta],
                  [tr("Channel fit"), r.channel_fit],
                ].map(([label, score]) => (
                  <span key={label}>
                    {label} <strong>{score}</strong>
                  </span>
                ))}
              </div>
              <div className="channel-review-notes">
                <div>
                  <h5>{tr("What worked")}</h5>
                  <p>{r.strengths || "—"}</p>
                </div>
                <div>
                  <h5>{tr("What to improve")}</h5>
                  <p>{r.improvements}</p>
                </div>
              </div>
              <details className="channel-evidence">
                <summary>{tr("Evidence inspected")}</summary>
                <p>{r.evidence}</p>
              </details>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function inputOf(channel?: Channel): ChannelInput {
  if (!channel)
    return {
      name: "",
      language: "en",
      voice_gender: "unspecified",
      lowercase_hashtags: true,
      links: [],
    };
  const {
    id: _id,
    version: _version,
    created_at: _created,
    updated_at: _updated,
    ...input
  } = channel;
  return input;
}

function ChannelForm({
  channel,
  onSaved,
  onCancel,
}: {
  channel?: Channel;
  onSaved: (c: Channel) => void;
  onCancel: () => void;
}) {
  const client = useQueryClient();
  const create = useMutation(writes.createChannel(client));
  const update = useMutation(writes.updateChannel(client));
  const logoUpload = useMutation(writes.uploadChannelLogo());
  const [logoError, setLogoError] = useState("");
  const [draft, setDraft] = useState(() => inputOf(channel));
  const [baseVersion, setBaseVersion] = useState(channel?.version);
  const busy = create.isPending || update.isPending || logoUpload.isPending;
  const error = create.error || update.error;
  const textFields = [
    ["audience", tr("Audience"), 4000],
    ["concept", tr("Concept"), 10000],
    ["tone", tr("Voice and tone"), 2000],
    ["hook_guidance", tr("Opening hooks"), 4000],
    ["cta_guidance", tr("Closing CTA"), 4000],
    ["visual_guidance", tr("Visual and pacing rules"), 4000],
    ["rules", tr("Standing editorial rules"), 20000],
    ["avoid", tr("Avoid"), 4000],
    ["learnings", tr("Approved lessons"), 10000],
  ] as const;
  async function uploadLogo(file: File) {
    setLogoError("");
    if (file.size > 5 * 1024 * 1024) {
      setLogoError(tr("Maximum logo size is 5 MiB"));
      return;
    }
    try {
      const logo = await logoUpload.mutateAsync(file);
      setDraft((current) => ({ ...current, logo_id: logo.id }));
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : String(error));
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      onSaved(
        channel
          ? await update.mutateAsync({
              channelId: channel.id,
              request: { ...draft, expected_version: baseVersion! },
            })
          : await create.mutateAsync(draft),
      );
    } catch {
      /* Keep draft visible on failure. */
    }
  }
  return (
    <form className="channel-form" onSubmit={(e) => void save(e)}>
      <h2>{channel ? tr("Edit channel brief") : tr("New channel")}</h2>
      <p>
        {tr(
          "Keep creative rules here, not credentials. Platform links are references only.",
        )}
      </p>
      {channel && channel.version !== baseVersion && !busy && (
        <div role="alert" className="error-banner">
          {tr(
            "This channel changed. Your draft is preserved. Reload the latest version before editing again.",
          )}
          <button
            type="button"
            className="button"
            onClick={() => {
              setDraft(inputOf(channel));
              setBaseVersion(channel.version);
              update.reset();
            }}
          >
            {tr("Discard draft and reload")}
          </button>
        </div>
      )}
      <nav className="channel-form-nav" aria-label={tr("Brief sections")}>
        {[
          ["identity", tr("Identity and voice")],
          ["direction", tr("Audience and concept")],
          ["production", tr("Production guidance")],
          ["rules", tr("Rules and learning")],
          ["platforms", tr("Platform links")],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() =>
              document
                .getElementById(`channel-${id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <fieldset disabled={busy}>
        <section className="channel-form-section" id="channel-identity">
          <h3>{tr("Identity and voice")}</h3>
          <div className="channel-logo-editor">
            <ChannelAvatar name={draft.name} logoId={draft.logo_id} large />
            <div>
              <label className="field">
                {tr("Channel logo")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby="channel-logo-help"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <p id="channel-logo-help" className="channel-help">
                {tr(
                  "PNG, JPEG or WebP, up to 5 MiB. Upload first, then Save channel to apply.",
                )}
              </p>
              {logoUpload.isPending && (
                <p role="status">{tr("Uploading logo…")}</p>
              )}
              {logoError && (
                <p role="alert" className="error-banner">
                  {logoError}
                </p>
              )}
              {draft.logo_id && (
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => setDraft({ ...draft, logo_id: null })}
                >
                  {tr("Remove logo")}
                </button>
              )}
            </div>
          </div>
          <p className="channel-help">
            {tr(
              "Set the language and narration defaults agents should follow.",
            )}
          </p>
          <div className="channel-form-grid">
            <label className="field">
              {tr("Channel name")}
              <input
                required
                maxLength={200}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              {tr("Content language")}
              <input
                required
                maxLength={50}
                list="channel-languages"
                value={draft.language}
                onChange={(e) =>
                  setDraft({ ...draft, language: e.target.value })
                }
              />
              <datalist id="channel-languages">
                <option value="en">{tr("English")}</option>
                <option value="pl">{tr("Polish")}</option>
                <option value="es">{tr("Spanish")}</option>
                <option value="de">{tr("German")}</option>
                <option value="fr">{tr("French")}</option>
              </datalist>
            </label>
            <label className="field">
              {tr("Preferred voice")}
              <select
                value={draft.voice_gender}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    voice_gender: e.target
                      .value as ChannelInput["voice_gender"],
                  })
                }
              >
                <option value="unspecified">{tr("No preference")}</option>
                <option value="male">{tr("Male")}</option>
                <option value="female">{tr("Female")}</option>
                <option value="neutral">{tr("Neutral")}</option>
              </select>
            </label>
            <label className="field">
              {tr("Preferred TTS provider ID")}
              <input
                maxLength={100}
                value={draft.voice_provider || ""}
                onChange={(e) =>
                  setDraft({ ...draft, voice_provider: e.target.value })
                }
              />
            </label>
            <label className="field">
              {tr("Preferred voice ID")}
              <input
                maxLength={200}
                value={draft.voice_id || ""}
                onChange={(e) =>
                  setDraft({ ...draft, voice_id: e.target.value })
                }
              />
            </label>
          </div>
        </section>
        {(
          [
            ["direction", tr("Audience and concept"), ["audience", "concept"]],
            [
              "production",
              tr("Production guidance"),
              ["tone", "hook_guidance", "cta_guidance", "visual_guidance"],
            ],
            [
              "rules",
              tr("Rules and learning"),
              ["rules", "avoid", "learnings"],
            ],
          ] as const
        ).map(([section, title, fields]) => (
          <section
            className="channel-form-section"
            id={`channel-${section}`}
            key={section}
          >
            <h3>{title}</h3>
            {textFields
              .filter(([key]) => (fields as readonly string[]).includes(key))
              .map(([key, label, maxLength]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`brief-${key}`}>{label}</FieldLabel>
                  <Textarea
                    id={`brief-${key}`}
                    aria-describedby={`brief-${key}-hint`}
                    rows={key === "rules" ? 14 : 7}
                    maxLength={maxLength}
                    value={draft[key] || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                  <FieldDescription id={`brief-${key}-hint`}>
                    {tr("{{count}} / {{limit}} characters", {
                      count: (draft[key] || "").length,
                      limit: maxLength,
                    })}
                  </FieldDescription>
                </Field>
              ))}
          </section>
        ))}
        <label className="channel-check">
          <input
            type="checkbox"
            checked={draft.lowercase_hashtags ?? true}
            onChange={(e) =>
              setDraft({ ...draft, lowercase_hashtags: e.target.checked })
            }
          />
          {tr("Use lowercase hashtags")}
        </label>
        <ChannelLinksEditor
          links={draft.links || []}
          onChange={(links) => setDraft({ ...draft, links })}
        />
        {channel && (
          <label className="channel-check">
            <input
              type="checkbox"
              checked={draft.archived ?? false}
              onChange={(e) =>
                setDraft({ ...draft, archived: e.target.checked })
              }
            />
            {tr("Archive channel (keep projects and history)")}
          </label>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="error-banner">
          {error.message}
        </p>
      )}
      <div className="dialog-actions channel-save-bar">
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          {tr("Cancel")}
        </button>
        <button
          className="button primary"
          disabled={
            busy ||
            !draft.name.trim() ||
            (channel !== undefined && channel.version !== baseVersion)
          }
        >
          {busy ? tr("Saving…") : tr("Save channel")}
        </button>
      </div>
    </form>
  );
}

function PublicationForm({
  detail,
  initial,
  onClose,
}: {
  detail: ChannelDetail;
  initial?: Publication;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const client = useQueryClient();
  const mutation = useMutation(writes.channelPublication(client));
  const [request, setRequest] = useState<PublicationWrite>(() => {
    const {
      id: _id,
      recorded_at: _at,
      ...fields
    } = initial || ({} as Partial<Publication>);
    return {
      title: "",
      platform: "youtube",
      url: "",
      status: "published",
      ...fields,
      publication_id: initial?.id,
      expected_version: detail.channel.version,
    };
  });
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    formRef.current
      ?.querySelector<HTMLInputElement>("input")
      ?.focus({ preventScroll: true });
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ channelId: detail.channel.id, request });
      onClose();
    } catch {
      /* Preserve entered observations. */
    }
  }
  return (
    <form
      ref={formRef}
      className="channel-inline-form"
      onSubmit={(e) => void save(e)}
    >
      <h4>{initial ? tr("Edit record") : tr("Record publication")}</h4>
      <fieldset disabled={mutation.isPending}>
        <div className="channel-form-grid">
          <label className="field">
            {tr("Video title")}
            <input
              required
              maxLength={200}
              value={request.title}
              onChange={(e) =>
                setRequest({ ...request, title: e.target.value })
              }
            />
          </label>
          <label className="field">
            {tr("Video URL")}
            <input
              type="url"
              pattern="https://.*"
              required
              maxLength={2000}
              value={request.url}
              onChange={(e) => setRequest({ ...request, url: e.target.value })}
            />
          </label>
          <label className="field">
            {tr("Platform")}
            <select
              value={request.platform}
              onChange={(e) =>
                setRequest({
                  ...request,
                  platform: e.target.value as ChannelLink["platform"],
                })
              }
            >
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {platformNames[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr("Linked project")}
            <select
              value={request.project_id || ""}
              onChange={(e) =>
                setRequest({ ...request, project_id: e.target.value || null })
              }
            >
              <option value="">{tr("No project")}</option>
              {initial?.project_id &&
                !detail.projects.some((p) => p.id === initial.project_id) && (
                  <option value={initial.project_id}>
                    {tr("Previously linked project")}
                  </option>
                )}
              {detail.projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr("Status")}
            <select
              value={request.status}
              onChange={(e) =>
                setRequest({
                  ...request,
                  status: e.target.value as PublicationWrite["status"],
                })
              }
            >
              <option value="draft">{tr("Draft")}</option>
              <option value="scheduled">{tr("Scheduled")}</option>
              <option value="published">{tr("Published")}</option>
            </select>
          </label>
          {(
            [
              ["views", tr("Views")],
              ["likes", tr("Likes")],
              ["comments", tr("Comments")],
              ["average_viewed_percent", tr("Average viewed (%)")],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                type="number"
                min={0}
                max={key === "average_viewed_percent" ? 1000 : undefined}
                step={key === "average_viewed_percent" ? "0.1" : 1}
                value={request[key] ?? ""}
                onChange={(e) =>
                  setRequest({
                    ...request,
                    [key]:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
          <label className="field">
            {tr("Publication time (ISO with timezone)")}
            <input
              placeholder={tr("Example: 2026-09-16T18:30:00+02:00")}
              value={request.published_at || ""}
              onChange={(e) =>
                setRequest({ ...request, published_at: e.target.value || null })
              }
            />
          </label>
          <label className="field">
            {tr("Metrics observed at (ISO with timezone)")}
            <input
              placeholder={tr("Example: 2026-09-16T18:30:00+02:00")}
              value={request.metrics_as_of || ""}
              onChange={(e) =>
                setRequest({
                  ...request,
                  metrics_as_of: e.target.value || null,
                })
              }
            />
          </label>
          <label className="field channel-wide">
            {tr("Source and observation notes")}
            <textarea
              maxLength={4000}
              rows={3}
              value={request.evidence || ""}
              onChange={(e) =>
                setRequest({ ...request, evidence: e.target.value })
              }
            />
          </label>
        </div>
      </fieldset>
      <RecordActions
        error={mutation.error}
        busy={mutation.isPending}
        stale={request.expected_version !== detail.channel.version}
        onClose={onClose}
      />
    </form>
  );
}

function ReviewForm({
  detail,
  onClose,
}: {
  detail: ChannelDetail;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const client = useQueryClient();
  const mutation = useMutation(writes.channelReview(client));
  const first = detail.projects[0];
  const [request, setRequest] = useState<ChannelReviewWrite>({
    expected_version: detail.channel.version,
    project_id: first?.id || "",
    project_revision: first?.revision || 1,
    author: "owner",
    hook: 5,
    pacing: 5,
    clarity: 5,
    cta: 5,
    channel_fit: 5,
    evidence: "",
    improvements: "",
    strengths: "",
  });
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    formRef.current
      ?.querySelector<HTMLSelectElement>("select")
      ?.focus({ preventScroll: true });
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ channelId: detail.channel.id, request });
      onClose();
    } catch {
      /* Keep draft. */
    }
  }
  return (
    <form
      ref={formRef}
      className="channel-inline-form"
      onSubmit={(e) => void save(e)}
    >
      <h4>{tr("Add editorial review")}</h4>
      <fieldset disabled={mutation.isPending}>
        <div className="channel-form-grid">
          <label className="field">
            {tr("Linked project")}
            <select
              value={request.project_id}
              onChange={(e) => {
                const p = detail.projects.find((p) => p.id === e.target.value)!;
                setRequest({
                  ...request,
                  project_id: p.id,
                  project_revision: p.revision,
                });
              }}
            >
              {detail.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr("Inspected project revision")}
            <input
              type="number"
              required
              min={1}
              value={request.project_revision}
              onChange={(e) =>
                setRequest({
                  ...request,
                  project_revision: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="field">
            {tr("Reviewer")}
            <input
              required
              maxLength={200}
              value={request.author}
              onChange={(e) =>
                setRequest({ ...request, author: e.target.value })
              }
            />
          </label>
          {(
            [
              ["hook", tr("Hook")],
              ["pacing", tr("Pacing")],
              ["clarity", tr("Clarity")],
              ["cta", tr("Closing CTA")],
              ["channel_fit", tr("Channel fit")],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {tr("{{criterion}} (0–10)", { criterion: label })}
              <input
                type="number"
                required
                min={0}
                max={10}
                step={1}
                value={request[key]}
                onChange={(e) =>
                  setRequest({ ...request, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          {(
            [
              ["evidence", tr("Evidence inspected")],
              ["strengths", tr("What worked")],
              ["improvements", tr("What to improve")],
            ] as const
          ).map(([key, label]) => (
            <label className="field channel-wide" key={key}>
              {label}
              <textarea
                rows={3}
                required={key !== "strengths"}
                maxLength={key === "strengths" ? 4000 : 6000}
                value={request[key] || ""}
                onChange={(e) =>
                  setRequest({ ...request, [key]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <RecordActions
        error={mutation.error}
        busy={mutation.isPending}
        stale={request.expected_version !== detail.channel.version}
        onClose={onClose}
      />
    </form>
  );
}

function RecordActions({
  error,
  busy,
  stale,
  onClose,
}: {
  error: Error | null;
  busy: boolean;
  stale: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {error && (
        <p className="error-banner" role="alert">
          {error.message}
        </p>
      )}
      {stale && !busy && (
        <p role="alert">
          {tr(
            "This channel changed. Close and reopen this form to review the latest version.",
          )}
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onClose}
        >
          {tr("Cancel")}
        </button>
        <button className="button primary" disabled={busy || stale}>
          {busy ? tr("Saving…") : tr("Save record")}
        </button>
      </div>
    </>
  );
}
