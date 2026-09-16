import { useState, type SetStateAction } from "react";
import {
  useForm,
  useWatch,
  type DefaultValues,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
} from "react-hook-form";

/** Controlled domain forms retain dirty drafts while Query polls the server. */
export function useFormDraft<T extends FieldValues>(initial: T | (() => T)) {
  const [defaults] = useState(initial);
  const form = useForm<T>({
    defaultValues: defaults as DefaultValues<T>,
    mode: "onBlur",
  });
  const value = useWatch({ control: form.control }) as T;
  const setValue = (action: SetStateAction<T>) => {
    const current = form.getValues();
    const next = typeof action === "function" ? action(current) : action;
    for (const key of Object.keys(next) as FieldPath<T>[]) {
      if (current[key] !== next[key])
        form.setValue(key, next[key] as FieldPathValue<T, typeof key>, {
          shouldDirty: true,
          shouldTouch: true,
        });
    }
  };
  return [value, setValue, form] as const;
}
