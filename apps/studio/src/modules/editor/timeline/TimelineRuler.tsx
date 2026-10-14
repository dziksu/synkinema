import { tr } from "@/lib/i18n";
import { useStudio } from "@/modules/editor/store";

export default function TimelineRuler({
  durationMs,
  fps,
  zoom,
  width,
  rulerDurationMs,
}: {
  durationMs: number;
  fps: number;
  zoom: number;
  width: number;
  rulerDurationMs: number;
}) {
  const time = useStudio((s) => s.time);
  const set = useStudio((s) => s.set);
  const maxTime = Math.max(0, durationMs - 1);
  const seek = (value: number) =>
    set({ time: Math.max(0, Math.min(maxTime, value)), playing: false });
  const seekPointer = (x: number, lane: HTMLElement) =>
    seek((x - lane.getBoundingClientRect().left) / (0.06 * zoom));
  return (
    <div className="ruler">
      <div className="ruler-label">{fps} FPS</div>
      <div
        className="ruler-line"
        style={{ width }}
        role="slider"
        aria-label={tr("Timeline playhead")}
        aria-valuemin={0}
        aria-valuemax={maxTime}
        aria-valuenow={Math.max(0, Math.min(maxTime, time))}
        aria-valuetext={`${(Math.max(0, Math.min(maxTime, time)) / 1000).toFixed(3)} s`}
        tabIndex={0}
        onKeyDown={(e) => {
          const current = useStudio.getState().time;
          let next: number;
          switch (e.key) {
            case "ArrowRight":
            case "ArrowUp":
              next = current + 1000 / fps;
              break;
            case "ArrowLeft":
            case "ArrowDown":
              next = current - 1000 / fps;
              break;
            case "Home":
              next = 0;
              break;
            case "End":
              next = maxTime;
              break;
            default:
              return;
          }
          e.preventDefault();
          e.stopPropagation();
          seek(next);
        }}
        onPointerDown={(e) => {
          e.currentTarget.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
          seekPointer(e.clientX, e.currentTarget);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            seekPointer(e.clientX, e.currentTarget);
        }}
      >
        {Array.from(
          { length: Math.ceil(rulerDurationMs / (zoom < 1 ? 5000 : 2000)) },
          (_, i) => {
            const t = i * (zoom < 1 ? 5000 : 2000);
            return (
              <span key={i} style={{ left: t * 0.06 * zoom }}>
                {`${(t / 1000).toFixed(2)} s`}
              </span>
            );
          },
        )}
      </div>
    </div>
  );
}
