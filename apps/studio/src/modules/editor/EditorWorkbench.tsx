import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RouteTabs } from "@/components/route-tabs";
import { i18n, operationLabel, tr } from "@/lib/i18n";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Clapperboard,
  LoaderCircle,
  Radio,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { EditorAudio } from "./EditorAudio";
import { EditorExports } from "./EditorExports";
import { EditorScript } from "./EditorScript";
import { EditorTimeline } from "./EditorTimeline";

import { useStudio } from "@/modules/editor/store";

import { timecode } from "@/lib/time";

import type { EditorController } from "@/modules/editor/hooks/use-editor-controller";

export function EditorWorkbench({
  controller,
}: {
  controller: EditorController;
}) {
  const {
    state,
    tab,
    setExportOpen,
    project,
    history,
    reviews,
    setManageProject,
    operation,
    resolveComment,
    addComment,
    edit,
    projectJobs,
  } = controller;
  const commentForm = useForm({ defaultValues: { comment: "" } });
  if (!project) return null;
  return (
    <>
      <header className="project-header">
        <div className="breadcrumb">
          <button onClick={() => state.set({ page: "projects" })}>
            {" "}
            {tr("Projects")}{" "}
          </button>
          <span>/</span>
          <strong>{project.name}</strong>
          <span className="revision">r{project.revision}</span>
          <Button
            variant="ghost"
            className="button subtle"
            onClick={() => setManageProject({ project, mode: "edit" })}
            title={tr("Edit channel assignment")}
          >
            {project.channel_context?.channel.name || tr("Independent project")}
          </Button>
          {project.channel_id && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button"
              aria-label={tr("Open channel brief")}
              title={tr("Open channel brief")}
              onClick={() =>
                state.set({
                  page: "channels",
                  projectId: null,
                  channelId: project.channel_id,
                  playing: false,
                })
              }
            >
              <Radio size={17} />
            </Button>
          )}
        </div>
        <div className="header-actions">
          <span className="save-status">
            {operation.isPending ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Check size={14} />
            )}{" "}
            {operation.isPending ? tr("Saving") : tr("Saved locally")}
          </span>
          <Button
            variant="ghost"
            className="button subtle"
            onClick={() => {
              const blob = new Blob([JSON.stringify(project, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "synkinema-project.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <ArrowDownToLine size={16} />
            JSON
          </Button>
          <Button
            variant="default"
            className="button primary"
            disabled={!project.duration_ms}
            onClick={() => setExportOpen(true)}
          >
            <Clapperboard size={16} /> {tr("Export")} <ArrowRight size={15} />
          </Button>
        </div>
      </header>
      <div className="project-tabs">
        <RouteTabs
          label={tr("Project sections")}
          value={tab}
          items={[
            {
              value: "timeline",
              label: tr("Edit"),
              search: { editorTab: undefined },
            },
            {
              value: "script",
              label: tr("Script"),
              search: { editorTab: "script" },
            },
            {
              value: "audio",
              label: tr("Audio"),
              search: { editorTab: "audio" },
            },
            {
              value: "exports",
              label: (
                <>
                  {tr("Exports")}
                  {projectJobs.length > 0 && (
                    <span className="rounded bg-muted px-1.5 text-xs">
                      {projectJobs.length}
                    </span>
                  )}
                </>
              ),
              search: { editorTab: "exports" },
            },
            {
              value: "history",
              label: tr("History"),
              search: { editorTab: "history" },
            },
          ]}
        />
        <span>
          {project.profile.width} × {project.profile.height} <i />{" "}
          {project.profile.fps} FPS <i /> {project.profile.kind.toUpperCase()}
        </span>
      </div>
      {tab === "timeline" ? (
        <EditorTimeline controller={controller} />
      ) : tab === "script" ? (
        <EditorScript controller={controller} />
      ) : tab === "audio" ? (
        <EditorAudio controller={controller} />
      ) : tab === "exports" ? (
        <EditorExports controller={controller} />
      ) : (
        <div className="content-page">
          <div className="section-title">
            <div>
              <span className="eyebrow">
                {" "}
                {tr("EVERY CHANGE HAS A HISTORY")}{" "}
              </span>
              <h1>{tr("Project revisions")}</h1>
              <p>
                {" "}
                {tr(
                  "Restoring creates a new revision. Source media remains unchanged.",
                )}{" "}
              </p>
            </div>
          </div>
          <div className="history-list">
            {history.map((h) => (
              <div key={h.revision}>
                <span className="history-number">
                  {h.revision.toString().padStart(2, "0")}
                </span>
                <div>
                  <strong>{operationLabel(h.operation)}</strong>
                  <small>
                    {new Date(h.created_at).toLocaleString(
                      i18n.resolvedLanguage || "en",
                    )}
                  </small>
                </div>
                {h.revision === project.revision ? (
                  <span className="badge">{tr("Current")}</span>
                ) : (
                  <Button
                    variant="outline"
                    className="button"
                    disabled={operation.isPending}
                    onClick={() =>
                      edit("restore_revision", { revision: h.revision })
                    }
                  >
                    {" "}
                    {tr("Restore")}{" "}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <h2>{tr("Review notes")}</h2>
          {reviews.map((r) => (
            <div className="review" key={r.id}>
              <span>
                {timecode(r.time_ms)} · r{r.revision}
              </span>
              <p>{r.message}</p>
              {!r.resolved && !r.id.startsWith("pending:") && (
                <Button
                  variant="ghost"
                  className="text-button"
                  onClick={() =>
                    resolveComment.mutate({
                      projectId: project.id,
                      commentId: r.id,
                    })
                  }
                >
                  {" "}
                  {tr("Mark as resolved")}{" "}
                </Button>
              )}
            </div>
          ))}
          <form
            className="comment-form"
            onSubmit={commentForm.handleSubmit(({ comment }) => {
              addComment.mutate(
                {
                  projectId: project.id,
                  request: {
                    revision: project.revision,
                    time_ms: Math.round(useStudio.getState().time),
                    message: comment,
                  },
                },
                {
                  onSuccess: () => {
                    if (commentForm.getValues("comment") === comment)
                      commentForm.reset({ comment: "" });
                  },
                },
              );
            })}
          >
            <Input
              {...commentForm.register("comment", { required: true })}
              required
              placeholder={tr("Add a review note…")}
            />
            <Button variant="outline" className="button">
              {tr("Add note")}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
