import { ErrorState, LoadingState } from "@/components/query-state";
import { tr } from "@/lib/i18n";
import ProjectManager from "@/modules/projects/ProjectManager";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EditorDialogs } from "./EditorDialogs";
import { EditorWorkbench } from "./EditorWorkbench";
import { useEditorController } from "./hooks/use-editor-controller";
import { useStudio } from "./store";

export function EditorPage({ projectId }: { projectId: string }) {
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    useStudio.setState({
      page: "studio",
      projectId,
      selectedId: null,
      time: 0,
      playing: false,
      draggingAsset: null,
      draggingSource: null,
      audioDraft: null,
    });
    setReady(true);
    const unsubscribe = useStudio.subscribe((next, previous) => {
      if (
        next.page === previous.page &&
        next.projectId === previous.projectId &&
        next.channelId === previous.channelId
      )
        return;
      if (next.page === "studio" && next.projectId)
        void navigate({
          to: "/projects/$projectId",
          params: { projectId: next.projectId },
        });
      else if (next.page === "channels" && next.channelId)
        void navigate({
          to: "/channels/$channelId",
          params: { channelId: next.channelId },
        });
      else
        void navigate({
          to: next.page === "studio" ? "/projects" : `/${next.page}`,
        });
    });
    return () => {
      unsubscribe();
      useStudio.setState({
        playing: false,
        draggingAsset: null,
        draggingSource: null,
        audioDraft: null,
      });
    };
  }, [projectId, navigate]);
  return ready ? <EditorSession /> : <LoadingState />;
}
function EditorSession() {
  const c = useEditorController();
  useEffect(() => {
    if (c.notice) toast(c.notice);
  }, [c.notice]);
  if (!c.project)
    return c.currentProjectError ? (
      <ErrorState error={c.currentProjectError} />
    ) : (
      <LoadingState />
    );
  return (
    <div {...c.dropzone.getRootProps()} className="editor-session">
      <input {...c.dropzone.getInputProps()} />
      <EditorWorkbench controller={c} />
      <EditorDialogs controller={c} />
      {c.manageProject && (
        <ProjectManager
          {...c.manageProject}
          onClose={() => c.setManageProject(undefined)}
          onDeleted={(message) => {
            toast.success(message);
            c.state.set({ page: "projects", projectId: null });
          }}
        />
      )}
      {c.dropzone.isDragActive && (
        <div className="drop-overlay">
          {tr(c.upload.isPending ? "Importing media…" : "Drop media here")}
        </div>
      )}
    </div>
  );
}
