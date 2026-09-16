import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";

export function RecordActions({
  error,
  busy,
  stale,
  onClose,
}: {
  error: Error | null;
  busy: boolean;
  stale: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {error && (
        <p className="error-banner" role="alert">
          {error.message}
        </p>
      )}
      {stale && !busy && (
        <p role="alert">
          {tr(
            "This channel changed. Close and reopen this form to review the latest version.",
          )}
        </p>
      )}
      <div className="dialog-actions">
        <Button
          variant="outline"
          type="button"
          className="button"
          disabled={busy}
          onClick={onClose}
        >
          {tr("Cancel")}
        </Button>
        <Button
          variant="default"
          className="button primary"
          disabled={busy || stale}
        >
          {busy ? tr("Saving…") : tr("Save record")}
        </Button>
      </div>
    </>
  );
}
