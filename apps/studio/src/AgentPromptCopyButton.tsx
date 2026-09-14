import { Copy } from "lucide-react";
import { tr } from "./i18n";

export default function AgentPromptCopyButton({
  prompt,
  onNotice,
  label = tr("Copy agent prompt"),
  ariaLabel,
  className = "button",
}: {
  prompt: string;
  onNotice: (message: string) => void;
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const copy = () => {
    if (!navigator.clipboard?.writeText) {
      onNotice(tr("Unable to copy the agent prompt"));
      return;
    }
    void navigator.clipboard
      .writeText(prompt)
      .then(() => onNotice(tr("Agent prompt copied")))
      .catch(() => onNotice(tr("Unable to copy the agent prompt")));
  };

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={copy}
    >
      <Copy size={15} /> {label}
    </button>
  );
}
