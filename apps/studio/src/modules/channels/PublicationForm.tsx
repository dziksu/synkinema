import type {
  ChannelDetail,
  ChannelLink,
  Publication,
  PublicationWrite,
} from "@/api/generated/client";
import { writes } from "@/api/mutations";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormDraft } from "@/hooks/use-form-draft";
import { tr } from "@/lib/i18n";
import {
  platformNames,
  platforms,
} from "@/modules/channels/ChannelLinksEditor";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { RecordActions } from "./RecordActions";
export function PublicationForm({
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
  const [request, setRequest, form] = useFormDraft<PublicationWrite>(() => {
    const {
      id: _id,
      recorded_at: _at,
      source_usage: _sourceUsage,
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
  async function save() {
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
      onSubmit={form.handleSubmit(save)}
    >
      <h4>{initial ? tr("Edit record") : tr("Record publication")}</h4>
      <fieldset disabled={mutation.isPending}>
        <div className="channel-form-grid">
          <label className="field">
            {tr("Video title")}
            <Input
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
            <Input
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
            <NativeSelect
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
            </NativeSelect>
          </label>
          <label className="field">
            {tr("Linked project")}
            <NativeSelect
              value={request.project_id || ""}
              onChange={(e) =>
                setRequest({
                  ...request,
                  project_id: e.target.value || null,
                  project_revision: null,
                })
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
            </NativeSelect>
          </label>
          <label className="field">
            {tr("Status")}
            <NativeSelect
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
            </NativeSelect>
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
              <Input
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
            <Input
              placeholder={tr("Example: 2026-09-16T18:30:00+02:00")}
              value={request.published_at || ""}
              onChange={(e) =>
                setRequest({ ...request, published_at: e.target.value || null })
              }
            />
          </label>
          <label className="field">
            {tr("Metrics observed at (ISO with timezone)")}
            <Input
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
            <Textarea
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
