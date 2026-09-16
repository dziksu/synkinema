import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tr } from "@/lib/i18n";
import { Plus, X } from "lucide-react";
import { useState } from "react";
export default function TagInput({
  tags,
  onChange,
  disabled = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  function commit(value = draft) {
    const added = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const next = [...new Set([...tags, ...added])];
    if (next.length > 50 || next.some((t) => t.length > 100)) {
      setError(tr("Use up to 50 tags, each no longer than 100 characters."));
      return;
    }
    if (added.length) onChange(next);
    setDraft("");
    setError("");
  }
  return (
    <div className="tag-editor">
      <div className="tag-chips">
        {tags.map((tag) => (
          <span key={tag}>
            {tag}
            <button
              type="button"
              disabled={disabled}
              aria-label={tr("Remove tag {{tag}}", { tag })}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-entry">
        <Input
          aria-label={tr("New tag")}
          placeholder={tr("Type a tag, then Enter")}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value.includes(",")) commit(e.target.value);
            else setDraft(e.target.value);
          }}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          className="icon-button"
          aria-label={tr("Add tag")}
          disabled={disabled || !draft.trim()}
          onClick={() => commit()}
        >
          <Plus size={16} />
        </Button>
      </div>
      <small>{tr("Tags help every project find this file.")}</small>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
