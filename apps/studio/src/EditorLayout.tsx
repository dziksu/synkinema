import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { tr } from "./i18n";

function readPreference(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function savePreference(key: string, value: boolean | number) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Layout remains usable without storage. */
  }
}
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => readPreference("synkinema.sidebarCollapsed") === true,
  );
  const toggle = () =>
    setCollapsed((value) => {
      savePreference("synkinema.sidebarCollapsed", !value);
      return !value;
    });
  return { collapsed, toggle };
}
export function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed ? tr("Expand sidebar") : tr("Collapse sidebar");
  return (
    <button
      className="icon-button sidebar-toggle"
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      aria-controls="workspace-sidebar"
      onClick={onToggle}
    >
      {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
    </button>
  );
}
export function clampMediaWidth(width: number, available: number) {
  return Math.max(200, Math.min(width, 640, Math.max(200, available - 560)));
}
export function EditorTop({
  sourceOpen,
  children,
}: {
  sourceOpen: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; preferred: number } | null>(
    null,
  );
  const [available, setAvailable] = useState(window.innerWidth - 218);
  const [preferred, setPreferred] = useState(() => {
    const value = readPreference("synkinema.mediaPanelWidth");
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(200, Math.min(640, value))
      : 280;
  });
  const width = clampMediaWidth(preferred, available);
  const maximum = clampMediaWidth(640, available);
  useEffect(() => {
    if (!root.current) return;
    const measure = () =>
      setAvailable(root.current!.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const commit = (value: number) => {
    setPreferred(value);
    savePreference("synkinema.mediaPanelWidth", value);
  };
  return (
    <div
      ref={root}
      className={`editor-top resizable-media ${sourceOpen ? "source-open" : ""}`}
      style={{ "--media-panel-width": `${width}px` } as CSSProperties}
    >
      {children}
      {!sourceOpen && (
        <div
          className="media-panel-resizer"
          role="separator"
          tabIndex={0}
          aria-label={tr("Project media width")}
          aria-orientation="vertical"
          aria-valuemin={200}
          aria-valuemax={maximum}
          aria-valuenow={width}
          title={tr("Drag to resize · Double-click to reset")}
          onDoubleClick={() => commit(280)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && drag.current) {
              event.preventDefault();
              setPreferred(drag.current.preferred);
              drag.current = null;
            }
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            event.stopPropagation();
            commit(
              event.key === "Home"
                ? 200
                : event.key === "End"
                  ? maximum
                  : clampMediaWidth(
                      width + (event.key === "ArrowRight" ? 24 : -24),
                      available,
                    ),
            );
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            drag.current = { x: event.clientX, width, preferred };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setPreferred(
                clampMediaWidth(
                  drag.current.width + event.clientX - drag.current.x,
                  available,
                ),
              );
          }}
          onPointerUp={(event) => {
            if (!drag.current) return;
            commit(
              clampMediaWidth(
                drag.current.width + event.clientX - drag.current.x,
                available,
              ),
            );
            drag.current = null;
          }}
          onPointerCancel={() => {
            if (drag.current) setPreferred(drag.current.preferred);
            drag.current = null;
          }}
        />
      )}
    </div>
  );
}
