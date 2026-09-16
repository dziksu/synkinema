import type { ChannelDetail, ChannelReviewWrite } from "@/api/generated/client";
import { writes } from "@/api/mutations";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormDraft } from "@/hooks/use-form-draft";
import { tr } from "@/lib/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { RecordActions } from "./RecordActions";
export function ReviewForm({
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
  const [request, setRequest, form] = useFormDraft<ChannelReviewWrite>({
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
  async function save() {
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
      onSubmit={form.handleSubmit(save)}
    >
      <h4>{tr("Add editorial review")}</h4>
      <fieldset disabled={mutation.isPending}>
        <div className="channel-form-grid">
          <label className="field">
            {tr("Linked project")}
            <NativeSelect
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
            </NativeSelect>
          </label>
          <label className="field">
            {tr("Inspected project revision")}
            <Input
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
            <Input
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
              <Input
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
              <Textarea
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
