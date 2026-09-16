import { useLayoutEffect, useState, type RefObject } from "react";

export function fitPreview(
  width: number,
  height: number,
  frameWidth: number,
  frameHeight: number,
  zoom = 1,
) {
  if (
    ![width, height, frameWidth, frameHeight, zoom].every(Number.isFinite) ||
    frameWidth <= 0 ||
    frameHeight <= 0
  )
    return { width: 0, height: 0 };
  const scale =
    Math.max(0, Math.min(width / frameWidth, height / frameHeight)) *
    Math.max(0, Math.min(1, zoom));
  return { width: frameWidth * scale, height: frameHeight * scale };
}

export function usePreviewSize(
  stageRef: RefObject<HTMLDivElement | null>,
  frameWidth: number,
  frameHeight: number,
  zoom: number,
) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let active = true;
    const update = (width: number, height: number) => {
      if (!active) return;
      const next = fitPreview(width, height, frameWidth, frameHeight, zoom);
      setSize((current) =>
        Math.abs(current.width - next.width) < 0.01 &&
        Math.abs(current.height - next.height) < 0.01
          ? current
          : next,
      );
    };
    const measure = () => {
      const box = stage.getBoundingClientRect();
      const css = getComputedStyle(stage);
      const px = (value: string) => Number.parseFloat(value) || 0;
      update(
        box.width -
          px(css.paddingLeft) -
          px(css.paddingRight) -
          px(css.borderLeftWidth) -
          px(css.borderRightWidth),
        box.height -
          px(css.paddingTop) -
          px(css.paddingBottom) -
          px(css.borderTopWidth) -
          px(css.borderBottomWidth),
      );
    };
    // The canvas is absolutely positioned: its last fitted size cannot enlarge
    // the stage when leaving expanded view or changing a desktop panel.
    measure();
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(stage);
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, [stageRef, frameWidth, frameHeight, zoom]);
  return size;
}
