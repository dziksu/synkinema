import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";

export function SearchField({
  wrapperClassName,
  className,
  ...props
}: ComponentProps<typeof Input> & { wrapperClassName?: string }) {
  return (
    <div className={cn("studio-search-field", wrapperClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        {...props}
        className={cn(
          "w-full appearance-none pl-9 shadow-none focus-visible:ring-0 focus-visible:border-ring",
          className,
        )}
      />
    </div>
  );
}
