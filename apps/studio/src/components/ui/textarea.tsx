import type { ComponentProps } from "react";

// Source-owned shadcn-style primitive, using Studio's color tokens.
export function Textarea({
  className = "",
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={`ui-textarea ${className}`}
      {...props}
    />
  );
}
