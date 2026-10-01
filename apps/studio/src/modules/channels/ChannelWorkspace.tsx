import { RouteTabs } from "@/components/route-tabs";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import type { ChannelDetail, Publication } from "@/api/generated/client";
import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import ChannelAvatar from "@/modules/channels/ChannelAvatar";
import {
  channelLinkLabel,
  platformNames,
} from "@/modules/channels/ChannelLinksEditor";
import ChannelProjectLinker from "@/modules/channels/ChannelProjectLinker";
import ChannelProjectUnlinker from "@/modules/channels/ChannelProjectUnlinker";
import AgentPromptCopyButton from "@/modules/settings/AgentPromptCopyButton";
import { channelAgentPrompt } from "@/modules/settings/agentPrompts";
import { ArrowRight, ExternalLink, Plus, Unlink } from "lucide-react";
import { useState } from "react";

import { ChannelForm } from "./ChannelForm";
import { PublicationForm } from "./PublicationForm";
import { ReviewForm } from "./ReviewForm";
export function ChannelWorkspace({
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
  const { search } = useWorkspaceNavigation();
  const tab = search.channelTab ?? "brief";
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
          <Button
            variant="outline"
            className="button"
            onClick={() => setEditing(true)}
          >
            {tr("Edit channel brief")}
          </Button>
        </div>
      </div>
      {notice && (
        <p className="channel-help" role="status">
          {notice}
        </p>
      )}
      <RouteTabs
        label={tr("Channel sections")}
        value={tab}
        idPrefix="channel-tab"
        className="mb-5 border-b border-border"
        items={[
          {
            value: "brief",
            label: tr("Direction"),
            search: { channelTab: undefined },
          },
          {
            value: "publications",
            label: tr("Published videos"),
            search: { channelTab: "publications" },
          },
          {
            value: "reviews",
            label: tr("Reviews and learning"),
            search: { channelTab: "reviews" },
          },
        ]}
      />
      {tab === "brief" && (
        <div
          className="channel-layout"
          id="channel-panel-brief"
          role="region"
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
              <Button
                variant="default"
                className="button primary"
                disabled={c.archived}
                onClick={() => setLinking(true)}
              >
                <Plus size={16} />
                {tr("Link existing project")}
              </Button>
              <Button
                variant="outline"
                className="button"
                onClick={onNewProject}
                disabled={c.archived}
              >
                <Plus size={15} />
                {tr("Create new project")}
              </Button>
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
                  <Button
                    variant="ghost"
                    className="button subtle channel-project-unlink"
                    onClick={() => setUnlinking({ id: p.id, name: p.name })}
                  >
                    <Unlink size={14} />
                    {tr("Unlink project")}
                  </Button>
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
          role="region"
          aria-labelledby="channel-tab-publications"
        >
          <div className="channel-section-title">
            <h3>{tr("Published videos")}</h3>
            <Button
              variant="outline"
              className="button"
              onClick={() => setPublication("new")}
            >
              <Plus size={16} />
              {tr("Record publication")}
            </Button>
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
                          !detail.archived_project_ids.includes(
                            p.project_id,
                          ) && (
                            <Button
                              variant="ghost"
                              className="button subtle"
                              onClick={() => onProject(p.project_id!)}
                            >
                              {tr("Open project")}
                            </Button>
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
                        {p.project_id &&
                        detail.archived_project_ids.includes(p.project_id) ? (
                          <span
                            className="channel-archived-project"
                            role="status"
                          >
                            {tr("Project archived")}
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            className="button channel-edit-record"
                            onClick={() => setPublication(p)}
                          >
                            {tr("Edit record")}
                          </Button>
                        )}
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
          role="region"
          aria-labelledby="channel-tab-reviews"
        >
          <div className="channel-section-title">
            <h3>{tr("Reviews and learning")}</h3>
            <Button
              variant="outline"
              className="button"
              disabled={!detail.projects.length}
              onClick={() => setReviewing(true)}
            >
              <Plus size={16} />
              {tr("Add editorial review")}
            </Button>
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
                  <h4>{r.project_name || tr("Archived project")}</h4>
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
