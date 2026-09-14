import { useEffect } from "react";
import { useStudio } from "./store";

export function usePlaybackShortcut(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let pressed = false;
    const isSpace = (event: KeyboardEvent) =>
      event.code === "Space" || event.key === " ";
    const keydown = (event: KeyboardEvent) => {
      if (!isSpace(event) || event.isComposing) return;
      const target = event.target;
      if (!pressed) {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (target instanceof Element) {
          if (
            target.closest(
              'textarea, [role="textbox"], [role="dialog"], [role="alertdialog"]',
            )
          )
            return;
          if (target instanceof HTMLElement && target.isContentEditable) return;
          const input = target.closest("input");
          if (
            input &&
            ![
              "range",
              "number",
              "checkbox",
              "radio",
              "button",
              "submit",
              "reset",
              "color",
            ].includes(input.type)
          )
            return;
        }
      }
      // Capture before React controls can swallow Space or activate/scroll.
      event.preventDefault();
      event.stopPropagation();
      if (pressed || event.repeat) return;
      pressed = true;
      useStudio.setState((state) => ({ playing: !state.playing }));
    };
    const keyup = (event: KeyboardEvent) => {
      if (!isSpace(event) || !pressed) return;
      event.preventDefault();
      event.stopPropagation();
      pressed = false;
    };
    const blur = () => {
      pressed = false;
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
    };
  }, [enabled]);
}
