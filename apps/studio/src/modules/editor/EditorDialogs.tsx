import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import ElementPicker from "@/modules/editor/ElementPicker";
import { CaptionStyles } from "@/modules/editor/preview/CanvasTools";
import ExportSettings from "@/modules/exports/ExportSettings";
import { NewTrackForm } from "./new-track-form";

import { Modal } from "@/components/modal";

import type { EditorController } from "@/modules/editor/hooks/use-editor-controller";

export function EditorDialogs({
  controller,
}: {
  controller: EditorController;
}) {
  const {
    trackOpen,
    setTrackOpen,
    elementOpen,
    setElementOpen,
    captionOpen,
    setCaptionOpen,
    captionStyle,
    setCaptionStyle,
    exportOpen,
    setExportOpen,
    inspection,
    setInspection,
    project,
    operation,
    edit,
    render,
    insertVisual,
    insertCaption,
  } = controller;
  return (
    <>
      {" "}
      <Modal
        open={trackOpen}
        onOpenChange={setTrackOpen}
        title={tr("New track")}
      >
        {trackOpen && (
          <NewTrackForm
            onSubmit={async (values) => {
              const result = await edit("add_track", values);
              if (result) setTrackOpen(false);
              return !!result;
            }}
          />
        )}
      </Modal>
      <ElementPicker
        open={elementOpen}
        onOpenChange={setElementOpen}
        onInsert={insertVisual}
      />
      <Modal
        open={captionOpen}
        onOpenChange={setCaptionOpen}
        title={tr("Add caption")}
      >
        <CaptionStyles value={captionStyle} onChange={setCaptionStyle} />
        <Button
          variant="default"
          className="button primary wide"
          onClick={() => {
            insertCaption();
            setCaptionOpen(false);
          }}
        >
          {tr("Add caption")}
        </Button>
      </Modal>
      <Modal
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={tr("Your story is ready to export")}
      >
        <p className="muted">
          {tr("{{name}} · revision {{revision}}", {
            name: project?.name,
            revision: project?.revision,
          })}
        </p>
        {project && (
          <ExportSettings
            key={project.id}
            project={project}
            busy={render.isPending || operation.isPending}
            onExport={(request) => render.mutate({ project, request })}
          />
        )}
      </Modal>
      <Modal
        open={!!inspection}
        onOpenChange={() => setInspection(null)}
        title={tr("Render inspection")}
      >
        {inspection && (
          <img
            className="inspection-image"
            src={inspection}
            alt={tr("Actual rendered video frames")}
          />
        )}
      </Modal>
    </>
  );
}
