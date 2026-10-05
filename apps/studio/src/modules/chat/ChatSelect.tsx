import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";
import { useId } from "react";

export function ChatSelect({
  label,
  value,
  onValueChange,
  options,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <Field className={cn("min-w-0 gap-2", className)}>
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} className="h-9 w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className="z-[70] max-h-72 max-w-[min(420px,calc(100vw-32px))]"
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              <span className="truncate">{option.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
