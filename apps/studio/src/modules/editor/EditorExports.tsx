import type { EditorController } from "@/modules/editor/hooks/use-editor-controller";
import RenderQueue from "@/modules/exports/RenderQueue";
export function EditorExports({
  controller,
}: {
  controller: EditorController;
}) {
  const { project, projectJobs } = controller;
  if (!project) return null;
  return (
    <RenderQueue key={project.id} jobs={projectJobs} projectId={project.id} />
  );
}
