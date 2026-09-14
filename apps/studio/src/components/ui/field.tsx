import type { ComponentProps } from "react";

export function Field({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="field" className={`ui-field ${className}`} {...props} />
  );
}
export function FieldLabel(props: ComponentProps<"label">) {
  return <label data-slot="field-label" {...props} />;
}
export function FieldDescription(props: ComponentProps<"p">) {
  return <p data-slot="field-description" {...props} />;
}
