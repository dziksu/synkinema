import { useEffect, useRef } from "react";

export default function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && document.activeElement !== input.current)
      input.current.value = String(value);
  });
  return (
    <label className="field compact">
      {label}
      <div className="number-field">
        <input
          ref={input}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = String(value);
              e.currentTarget.blur();
            }
          }}
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          step={step}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (
              e.target.value !== "" &&
              Number.isFinite(v) &&
              (min === undefined || v >= min) &&
              (max === undefined || v <= max)
            ) {
              if (v !== value) onChange(v);
            } else {
              e.target.value = String(value);
            }
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </label>
  );
}
