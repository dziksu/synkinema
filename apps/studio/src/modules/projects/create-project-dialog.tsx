import { DialogBody, DialogFooter, DialogForm } from "@/components/ui/dialog";
import { writes } from "@/api/mutations";
import { reads } from "@/api/queries";
import { Modal } from "@/components/modal";
import { ErrorState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { tr } from "@/lib/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  format: z.string().min(1),
  channel: z.string(),
});
export function CreateProjectDialog({
  open,
  onOpenChange,
  channelId = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channelId?: string;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={tr("Create a new project")}
    >
      {open && (
        <CreateProjectForm
          channelId={channelId}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Modal>
  );
}
function CreateProjectForm({
  channelId,
  onClose,
}: {
  channelId: string;
  onClose: () => void;
}) {
  const client = useQueryClient(),
    navigate = useNavigate();
  const presets = useQuery(reads.exportPresets()),
    channels = useQuery(reads.channels(client));
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", format: "reel-1080", channel: channelId },
  });
  const create = useMutation({
    ...writes.createProject(client),
    onSuccess: (project) => {
      onClose();
      void navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      });
    },
  });
  const submit = form.handleSubmit(async (values) => {
    const preset = presets.data?.presets.find((p) => p.id === values.format);
    if (!preset) {
      form.setError("format", { message: tr("Choose an available format") });
      return;
    }
    try {
      await create.mutateAsync({
        name: values.name,
        channel_id: values.channel || null,
        profile: {
          name: `${preset.name} · ${preset.resolution}`,
          kind: preset.kind,
          width: preset.width,
          height: preset.height,
        },
      });
    } catch {
      /* Query error remains visible. */
    }
  });
  return (
    <DialogForm onSubmit={submit}>
      <DialogBody>
        <p className="text-sm text-muted-foreground">
          {tr("Choose a canvas, give it a name, and start shaping your story.")}
        </p>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="project-name">
                {tr("Project name")}
              </FieldLabel>
              <Input
                {...field}
                id="project-name"
                autoFocus
                required
                maxLength={200}
                aria-invalid={fieldState.invalid}
                placeholder={tr("What story will you tell?")}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="format"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="project-format">
                {tr("Canvas format")}
              </FieldLabel>
              <NativeSelect
                {...field}
                id="project-format"
                disabled={!presets.data}
              >
                <>
                  {presets.data?.presets.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name} · {p.width} × {p.height}
                    </NativeSelectOption>
                  ))}
                </>
              </NativeSelect>
              <FieldDescription>
                {tr(
                  "Export formats can be changed later without changing your timeline.",
                )}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="channel"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="project-channel">
                {tr("Editorial channel")}
              </FieldLabel>
              <NativeSelect
                {...field}
                id="project-channel"
                disabled={channels.isPending || channels.isError}
              >
                <NativeSelectOption value="">
                  {tr("Independent project (no channel)")}
                </NativeSelectOption>
                {channels.data
                  ?.filter((c) => !c.archived || c.id === channelId)
                  .map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </Field>
          )}
        />
        {(presets.error || channels.error || create.error) && (
          <ErrorState
            error={(presets.error || channels.error || create.error)!}
            retry={() => {
              void presets.refetch();
              void channels.refetch();
            }}
          />
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={create.isPending}
        >
          {tr("Cancel")}
        </Button>
        <Button
          type="submit"
          disabled={create.isPending || !presets.data || channels.isError}
        >
          {create.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Plus />
          )}
          {tr("Create project")}
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
