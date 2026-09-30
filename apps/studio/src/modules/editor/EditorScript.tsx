import type { EditorController } from "@/modules/editor/hooks/use-editor-controller";
import { useStudio } from "@/modules/editor/store";
import ScriptEditor from "@/modules/script/ScriptEditor";
export function EditorScript({ controller }: { controller: EditorController }) {
  const { setShowRender, project, undoStacks, edit } = controller;
  if (!project) return null;
  return (
    <ScriptEditor
      key={project.id}
      project={project}
      onPlace={async (lineId, assetId, withCaptions) =>
        !!(await edit("insert_script_take", {
          line_id: lineId,
          asset_id: assetId,
          with_captions: withCaptions,
          start_ms: useStudio.getState().time,
        }))
      }
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
