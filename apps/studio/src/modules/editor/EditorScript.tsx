import type { EditorController } from "@/modules/editor/hooks/use-editor-controller";
import ScriptEditor from "@/modules/script/ScriptEditor";
export function EditorScript({ controller }: { controller: EditorController }) {
  const { setShowRender, project, undoStacks } = controller;
  if (!project) return null;
  return (
    <ScriptEditor
      key={project.id}
      project={project}
      onSaved={(saved) => {
        const stacks = (undoStacks.current[saved.id] ||= {
          undo: [],
          redo: [],
        });
        stacks.undo.push(saved.revision - 1);
        stacks.redo = [];
        setShowRender(false);
      }}
    />
  );
}
