import type { DeleteJobsRequest } from "@/api/generated/client";
import { writes } from "@/api/mutations";
import { reads } from "@/api/queries";
import ConfirmDelete from "@/components/ConfirmDelete";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  i18n,
  jobStatusLabel,
  renderPhaseLabel,
  tr,
  useLocale,
} from "@/lib/i18n";
import type { Job } from "@/lib/types";
import RenderInspection from "@/modules/exports/RenderInspection";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  Clapperboard,
  HardDrive,
  LoaderCircle,
  Play,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

export const fileSize = (size: number) =>
  size >= 1024 ** 3
    ? `${(size / 1024 ** 3).toFixed(2)} GB`
    : size >= 1024 ** 2
      ? `${(size / 1024 ** 2).toFixed(1)} MB`
      : `${(size / 1024).toFixed(1)} KB`;
const active = (j: Job) => j.status === "queued" || j.status === "running";
const percent = (j: Job) =>
  Math.round(Math.max(0, Math.min(1, j.progress)) * 100);
function elapsedLabel(job: Job, now: number) {
  if (!job.started_at || job.status !== "running") return "";
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(job.started_at)) / 1000),
  );
  if (!Number.isFinite(seconds)) return "";
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return tr("Elapsed {{time}}", { time });
}
export default function RenderQueue({
  jobs,
  projectId,
}: {
  jobs: Job[];
  projectId?: string;
}) {
  useLocale();
  const client = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [focused, setFocused] = useState<string>();
  const [confirm, setConfirm] = useState<{
    request: DeleteJobsRequest;
    names: string[];
  }>();
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const running = jobs.some((job) => job.status === "running");
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const deletion = useMutation(writes.deleteJobs(client));
  const cancellation = useMutation(writes.cancelJob(client));
  const cleanup = useQuery(reads.cleanup());
  const retry = useMutation(writes.retryCleanup(client));
  const shown = jobs.filter(
    (j) =>
      (!search ||
        j.project_name
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())) &&
      (filter === "all" ||
        (filter === "active" ? active(j) : j.status === filter)),
  );
  const selected = selection.filter((id) =>
    jobs.some((j) => j.id === id && !j.id.startsWith("pending:")),
  );
  const preview =
    jobs.find((j) => j.id === focused) ||
    shown.find((j) => j.output_url) ||
    shown[0];
  const toggleable = shown.filter((j) => !j.id.startsWith("pending:"));
  const allSelected =
    toggleable.length > 0 && toggleable.every((j) => selected.includes(j.id));
  const busy = deletion.isPending || cancellation.isPending;
  function ask(request: DeleteJobsRequest) {
    deletion.reset();
    setNotice("");
    setConfirm({
      request: { ...request, project_id: projectId },
      names: request.job_ids
        ? jobs
            .filter((j) => request.job_ids?.includes(j.id))
            .map((j) => `${j.project_name} · r${j.revision}`)
        : [],
    });
  }
  async function remove() {
    if (!confirm) return;
    try {
      const result = await deletion.mutateAsync(confirm.request);
      setSelection([]);
      setConfirm(undefined);
      setNotice(
        result.pending_files
          ? tr("Deletion saved. Some files still need disk cleanup.")
          : tr("Deleted {{count}} exports · {{size}} freed on disk.", {
              count: result.job_ids.length,
              size: fileSize(result.freed_bytes),
            }),
      );
    } catch {
      /* The confirmation remains open with a visible error and safe retry. */
    }
  }
  return (
    <div className="content-page render-page">
      <div className="render-summary">
        <div>
          <h2>{tr("Your finished stories")}</h2>
          <p>{tr("Preview, download and manage the files on your disk.")}</p>
        </div>
        <div className="render-metric">
          <strong>{jobs.filter(active).length}</strong>
          <span>{tr("In progress")}</span>
        </div>
        <div className="render-metric">
          <strong>{jobs.filter((j) => j.status === "completed").length}</strong>
          <span>{tr("Ready to play")}</span>
        </div>
        <div className="render-metric">
          <strong>
            {fileSize(jobs.reduce((n, j) => n + (j.metadata?.size || 0), 0))}
          </strong>
          <span>{tr("Listed exports")}</span>
        </div>
      </div>
      {notice && (
        <div role="status" className="render-notice">
          {notice}
        </div>
      )}
      {(cancellation.error || cleanup.error || retry.error) && (
        <p role="alert" className="error-banner">
          {(cancellation.error || cleanup.error || retry.error)?.message}
        </p>
      )}
      {!!cleanup.data?.pending_files && (
        <div className="render-notice warning" role="status">
          <HardDrive size={18} />
          <span>
            {tr(
              "{{count}} files are waiting for disk cleanup. Automatic retry is enabled.",
              { count: cleanup.data.pending_files },
            )}
          </span>
          <Button
            variant="outline"
            className="button"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            {tr("Retry cleanup")}
          </Button>
        </div>
      )}
      <div className="render-toolbar">
        <SearchField
          wrapperClassName="render-search"
          aria-label={tr("Search exports")}
          placeholder={tr("Search exports…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <NativeSelect
          aria-label={tr("Filter exports")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{tr("All exports")}</option>
          <option value="active">{tr("In progress")}</option>
          <option value="completed">{tr("Completed")}</option>
          <option value="failed">{tr("Failed")}</option>
          <option value="cancelled">{tr("Cancelled")}</option>
        </NativeSelect>
        <div className="render-toolbar-actions">
          <Button
            variant="outline"
            className="button"
            disabled={busy}
            onClick={() => ask({ status: "finished" })}
          >
            {tr("Clear finished")}
          </Button>
          <Button
            variant="destructive"
            className="button danger-outline"
            disabled={busy}
            onClick={() => ask({ status: "all" })}
          >
            <Trash2 size={16} />
            {tr("Clear queue")}
          </Button>
        </div>
      </div>
      <div className="render-workspace">
        <section className="render-list-panel" aria-label={tr("Exports")}>
          <div className="render-list-header">
            <label>
              <input
                type="checkbox"
                aria-label={tr("Select visible exports")}
                checked={allSelected}
                disabled={!toggleable.length || busy}
                onChange={() =>
                  setSelection(
                    allSelected
                      ? selected.filter(
                          (id) => !toggleable.some((j) => j.id === id),
                        )
                      : [
                          ...new Set([
                            ...selected,
                            ...toggleable.map((j) => j.id),
                          ]),
                        ],
                  )
                }
              />
              {selected.length
                ? tr("{{count}} selected", { count: selected.length })
                : tr("{{count}} exports", { count: shown.length })}
            </label>
            {selected.length > 0 && (
              <Button
                variant="destructive"
                className="text-button danger-text"
                disabled={busy}
                onClick={() => ask({ job_ids: selected })}
              >
                <Trash2 size={14} />
                {tr("Delete selected")}
              </Button>
            )}
          </div>
          <div className="render-rows">
            {shown.map((j) => (
              <article
                key={j.id}
                className={`render-row ${preview?.id === j.id ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={tr(
                    "Select export {{name}} revision {{revision}}",
                    { name: j.project_name, revision: j.revision },
                  )}
                  checked={selected.includes(j.id)}
                  disabled={busy || j.id.startsWith("pending:")}
                  onChange={() =>
                    setSelection(
                      selected.includes(j.id)
                        ? selected.filter((id) => id !== j.id)
                        : [...selected, j.id],
                    )
                  }
                />
                <button
                  className="render-row-main"
                  aria-label={tr("Preview {{name}} revision {{revision}}", {
                    name: j.project_name,
                    revision: j.revision,
                  })}
                  aria-pressed={preview?.id === j.id}
                  onClick={() => setFocused(j.id)}
                >
                  <span className={`render-row-icon ${j.status}`}>
                    {j.status === "running" ? (
                      <LoaderCircle className="spin" size={20} />
                    ) : j.output_url ? (
                      <Play size={20} />
                    ) : (
                      <Clapperboard size={20} />
                    )}
                  </span>
                  <span className="render-row-copy">
                    <strong>{j.project_name}</strong>
                    <small>
                      {tr("Revision {{revision}}", { revision: j.revision })} ·{" "}
                      {j.request.quality === "final"
                        ? tr("Final video")
                        : tr("Preview")}{" "}
                      ·{" "}
                      {(j.metadata?.width || j.output?.width) && (
                        <>
                          {j.metadata?.width || j.output?.width} ×{" "}
                          {j.metadata?.height || j.output?.height} ·{" "}
                        </>
                      )}
                      {new Date(j.created_at).toLocaleString(
                        i18n.resolvedLanguage || "en",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </small>
                    {active(j) && (
                      <>
                        <small className="render-progress-details">
                          <span>{renderPhaseLabel(j.phase || j.status)}</span>
                          <span>
                            {percent(j)}%
                            {elapsedLabel(j, now) &&
                              ` · ${elapsedLabel(j, now)}`}
                          </span>
                        </small>
                        <span
                          className="progress-track"
                          role="progressbar"
                          aria-label={tr("Export progress")}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent(j)}
                          aria-valuetext={`${renderPhaseLabel(j.phase || j.status)} · ${percent(j)}%`}
                        >
                          <span style={{ width: `${percent(j)}%` }} />
                        </span>
                      </>
                    )}
                  </span>
                  <span className={`badge ${j.status}`}>
                    {jobStatusLabel(j.status)}
                  </span>
                </button>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  className="icon-button danger-text"
                  aria-label={tr(
                    "Delete export {{name}} revision {{revision}}",
                    { name: j.project_name, revision: j.revision },
                  )}
                  disabled={busy || j.id.startsWith("pending:")}
                  onClick={() => ask({ job_ids: [j.id] })}
                >
                  <Trash2 size={16} />
                </Button>
              </article>
            ))}
            {!shown.length && (
              <div className="empty small">
                <Clapperboard size={36} />
                <h3>
                  {jobs.length
                    ? tr("No matching exports")
                    : tr("Your videos will appear here")}
                </h3>
                <p>
                  {jobs.length
                    ? tr("Try another search or filter.")
                    : tr("Start an export from a project.")}
                </p>
              </div>
            )}
          </div>
          <p className="render-list-footnote">
            {tr("Latest 100 exports. Clear queue includes older exports too.")}
          </p>
        </section>
        <aside
          className="render-preview-panel"
          aria-label={tr("Export preview")}
        >
          {preview ? (
            <>
              <div className="render-player">
                {preview.output_url ? (
                  <video
                    key={preview.id}
                    controls
                    preload="metadata"
                    src={preview.output_url}
                    aria-label={tr("Export video")}
                  />
                ) : (
                  <div className="empty small">
                    <Clapperboard size={40} />
                    <h3>{jobStatusLabel(preview.status)}</h3>
                    {active(preview) && (
                      <>
                        <p>
                          {renderPhaseLabel(preview.phase || preview.status)}
                        </p>
                        <p>
                          {tr("{{percent}}% rendered", {
                            percent: percent(preview),
                          })}
                        </p>
                        {elapsedLabel(preview, now) && (
                          <p>{elapsedLabel(preview, now)}</p>
                        )}
                        {preview.status === "running" && (
                          <p className="render-progress-hint">
                            {tr(
                              "Progress comes from the renderer. Compositing multiple layers can take longer than other stages.",
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="render-preview-info">
                <span className="eyebrow">{tr("SELECTED EXPORT")}</span>
                <h3>{preview.project_name}</h3>
                <p>
                  {tr("Revision {{revision}}", { revision: preview.revision })}{" "}
                  ·{" "}
                  {preview.request.quality === "final"
                    ? tr("Final video")
                    : tr("Preview")}
                </p>
                {preview.output && (
                  <p className="field-hint">
                    {preview.output.width} × {preview.output.height} ·{" "}
                    {preview.output.fps} FPS {" · "}
                    {tr("Quality CRF {{crf}}", { crf: preview.output.crf })}
                  </p>
                )}
                {preview.request.quality === "preview" && (
                  <p className="field-hint">
                    {tr(
                      "Draft preview · export a final video for full quality.",
                    )}
                  </p>
                )}
                {!!preview.warnings?.length && (
                  <details className="export-warnings">
                    <summary>
                      {tr("{{count}} source or framing warnings", {
                        count: preview.warnings.length,
                      })}
                    </summary>
                    <ul>
                      {preview.warnings.map((w, i) => (
                        <li key={`${w.code}-${i}`}>{w.message}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {preview.metadata && (
                  <div className="render-specs">
                    <span>
                      {preview.metadata.width} × {preview.metadata.height}
                    </span>
                    <span>
                      {((preview.metadata.duration_ms || 0) / 1000).toFixed(1)}{" "}
                      s
                    </span>
                    <span>{fileSize(preview.metadata.size)}</span>
                  </div>
                )}
                {preview.error && (
                  <p role="alert" className="error-text">
                    {preview.error}
                  </p>
                )}
                <div className="render-preview-actions">
                  {preview.output_url ? (
                    <>
                      <a
                        className="button primary"
                        href={preview.output_url}
                        download
                      >
                        <ArrowDownToLine size={16} />
                        {tr("Download MP4")}
                      </a>
                      <RenderInspection key={preview.id} job={preview} />
                    </>
                  ) : active(preview) ? (
                    <Button
                      variant="outline"
                      className="button"
                      disabled={busy || preview.id.startsWith("pending:")}
                      onClick={() => cancellation.mutate(preview.id)}
                    >
                      {tr("Cancel render")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="empty">
              <Play size={40} />
              <h3>{tr("Select an export to preview")}</h3>
              <p>{tr("One player. Full focus on your video.")}</p>
            </div>
          )}
        </aside>
      </div>
      {confirm && (
        <ConfirmDelete
          title={
            confirm.request.job_ids
              ? tr("Delete selected exports?")
              : confirm.request.status === "all"
                ? tr("Clear the entire queue?")
                : tr("Clear finished exports?")
          }
          pending={deletion.isPending}
          error={deletion.error?.message}
          onClose={() => setConfirm(undefined)}
          onConfirm={() => void remove()}
        >
          <p>
            {confirm.request.job_ids
              ? tr(
                  "The selected exports and their files will be permanently deleted.",
                )
              : confirm.request.status === "all"
                ? tr(
                    "All exports in this scope will be permanently deleted, including older exports. Running and queued renders will be stopped.",
                  )
                : tr(
                    "All completed, failed and cancelled exports in this scope will be permanently deleted, including older exports. Running and queued renders stay in the queue.",
                  )}
          </p>
          <p>
            <strong>
              {projectId
                ? tr("Scope: this project")
                : tr("Scope: all projects")}
            </strong>
          </p>
          {confirm.names.length > 0 && (
            <ul className="deletion-items">
              {confirm.names.map((name, i) => (
                <li key={`${i}-${name}`}>{name}</li>
              ))}
            </ul>
          )}
          <p>
            {tr(
              "MP4 files, partial renders and inspection files are removed from disk. Source media and project edits are kept. This cannot be undone.",
            )}
          </p>
        </ConfirmDelete>
      )}
    </div>
  );
}
