import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <img
        src="/brand/logo-64.png"
        srcSet="/brand/logo-64.png 1x, /brand/logo-128.png 2x"
        width={36}
        height={36}
        alt={iconOnly ? "Synkinema" : ""}
        className="size-9 -rotate-[7deg] shrink-0 object-contain group-data-[collapsible=icon]:size-7"
      />
      {!iconOnly && (
        <span className="grid text-left group-data-[collapsible=icon]:hidden">
          <span className="text-base font-semibold tracking-tight">
            synkinema
          </span>
          <span className="text-xs text-muted-foreground">
            {tr("Creative workspace")}
          </span>
        </span>
      )}
    </span>
  );
}
