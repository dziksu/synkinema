import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { tr, trackKindLabel } from "@/lib/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const kinds = [
  "overlay",
  "text",
  "sound",
  "music",
  "voiceover",
  "ambient",
] as const;
const schema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(kinds),
});
export function NewTrackForm({
  onSubmit,
}: {
  onSubmit: (values: z.infer<typeof schema>) => Promise<boolean>;
}) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", kind: "overlay" },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        if (!(await onSubmit(values)))
          form.setError("root", {
            message: tr("Unable to save. Your draft has been preserved."),
          });
      })}
    >
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="track-name">{tr("Track name")}</FieldLabel>
            <Input
              {...field}
              id="track-name"
              required
              autoFocus
              maxLength={200}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="kind"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="track-kind">{tr("Track type")}</FieldLabel>
            <NativeSelect {...field} id="track-kind">
              {kinds.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {trackKindLabel(kind)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
      />
      <FieldError errors={[form.formState.errors.root]} />
      <Button
        className="w-full"
        type="submit"
        disabled={form.formState.isSubmitting}
      >
        {tr("Add track")}
      </Button>
    </form>
  );
}
