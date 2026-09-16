import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { tr } from "@/lib/i18n";
import { Children, type ReactNode } from "react";
export function EditorTop({
  children,
}: {
  children: ReactNode;
  sourceOpen: boolean;
}) {
  const panes = Children.toArray(children);
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id="editor-columns"
      className="editor-top-v2"
    >
      {panes
        .map((pane, index) => (
          <ResizablePanel
            key={index}
            id={`editor-column-${index}`}
            defaultSize={index === 1 ? 50 : 25}
            minSize={index === 1 ? 25 : 15}
          >
            <div className="h-full min-w-0 overflow-auto">{pane}</div>
          </ResizablePanel>
        ))
        .flatMap((panel, index) =>
          index
            ? [
                <ResizableHandle
                  key={`handle-${index}`}
                  withHandle
                  aria-label={tr(
                    index === 1 ? "Project media width" : "Inspector width",
                  )}
                />,
                panel,
              ]
            : [panel],
        )}
    </ResizablePanelGroup>
  );
}
export function EditorPanels({ children }: { children: ReactNode }) {
  const [top, timeline] = Children.toArray(children);
  return (
    <ResizablePanelGroup
      orientation="vertical"
      id="editor-rows"
      className="editor-panels-v2"
    >
      <ResizablePanel id="preview" defaultSize={62} minSize={25}>
        {top}
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={tr("Timeline height")} />
      <ResizablePanel id="timeline" defaultSize={38} minSize={20}>
        {timeline}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
