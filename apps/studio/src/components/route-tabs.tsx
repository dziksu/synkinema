import { Button } from "@/components/ui/button";
import type { WorkspaceSearch } from "@/lib/workspace-search";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Navigation uses real links so bookmarks, browser history and new tabs work. */
export function RouteTabs({
  label,
  value,
  items,
  className = "",
  idPrefix,
}: {
  label: string;
  value: string;
  items: {
    value: string;
    label: ReactNode;
    search: Partial<WorkspaceSearch>;
  }[];
  className?: string;
  idPrefix?: string;
}) {
  return (
    <nav aria-label={label} className={`route-tabs ${className}`}>
      {items.map((item) => (
        <Button
          key={item.value}
          variant="ghost"
          asChild
          className="relative h-11 shrink-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 text-muted-foreground shadow-none aria-[current=page]:border-primary aria-[current=page]:text-foreground hover:bg-muted/40 focus-visible:ring-inset"
        >
          <Link
            to="."
            activeOptions={{
              exact: true,
              includeSearch: true,
              explicitUndefined: true,
            }}
            search={(previous) => ({ ...previous, ...item.search })}
            resetScroll={false}
            activeProps={{}}
            inactiveProps={{}}
            aria-current={value === item.value ? "page" : undefined}
            id={idPrefix ? `${idPrefix}-${item.value}` : undefined}
          >
            {item.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
