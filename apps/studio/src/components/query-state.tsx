import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tr } from "@/lib/i18n";
import { AlertCircle, FolderOpen, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
export function LoadingState() {
  return (
    <div
      className="space-y-5 p-8"
      role="status"
      aria-label={tr("Loading workspace")}
    >
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid gap-5 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="m-6 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm"
    >
      <AlertCircle className="size-5 text-destructive" />
      <span className="flex-1">{error.message}</span>
      {retry && (
        <Button variant="outline" onClick={retry}>
          <RotateCcw />
          {tr("Try again")}
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
      <div className="mb-4 rounded-xl bg-muted p-3">
        <FolderOpen className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-5 mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}
