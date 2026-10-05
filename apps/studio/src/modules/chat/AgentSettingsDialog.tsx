import { DialogBody, DialogFooter, DialogForm } from "@/components/ui/dialog";
import { chatWrites } from "@/api/mutations";
import { reads } from "@/api/queries";
import type {
  AgentSettingsOutput,
  AgentSettingsSnapshot,
} from "@/api/generated/client";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ChatSelect } from "./ChatSelect";

export const providers = ["codex", "claude", "copilot"] as const;
export const providerNames = {
  codex: "Codex",
  claude: "Claude Code",
  copilot: "GitHub Copilot",
};

export function AgentSettingsDialog({
  snapshot,
  onClose,
}: {
  snapshot: AgentSettingsSnapshot;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const fieldId = useId();
  const [draft, setDraft] = useState(snapshot.settings);
  const [version, setVersion] = useState(snapshot.version);
  const write = useMutation(chatWrites.settings(client));
  const models = useQuery({
    ...reads.agentModels(
      snapshot.version,
      snapshot.settings.providers.codex.executable,
    ),
    enabled: snapshot.enabled && snapshot.availability.codex,
  });
  const codexModel = models.data?.find(
    (model) => model.id === draft.providers.codex.model,
  );
  const efforts = codexModel?.reasoning_efforts || [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
  ];
  const change = (
    provider: (typeof providers)[number],
    patch: Partial<
      AgentSettingsOutput["providers"][(typeof providers)[number]]
    >,
  ) =>
    setDraft((old) => ({
      ...old,
      providers: {
        ...old.providers,
        [provider]: { ...old.providers[provider], ...patch },
      },
    }));
  return (
    <Modal
      open
      title={tr("Agent settings")}
      onOpenChange={(open) => !open && !write.isPending && onClose()}
    >
      <DialogForm
        onSubmit={(event) => {
          event.preventDefault();
          write.mutate(
            { expected_version: version, settings: draft },
            { onSuccess: onClose },
          );
        }}
      >
        <DialogBody className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {tr(
              "Agents run on the backend machine using their existing CLI login. Model requests use your provider account.",
            )}
          </p>
          <ChatSelect
            label={tr("Default agent")}
            value={draft.default_provider}
            disabled={write.isPending}
            onValueChange={(value) =>
              setDraft((old) => ({
                ...old,
                default_provider:
                  value as AgentSettingsOutput["default_provider"],
              }))
            }
            options={providers.map((provider) => ({
              value: provider,
              label: providerNames[provider],
            }))}
          />
          {providers.map((provider) => (
            <FieldSet
              key={provider}
              className="gap-4 rounded-lg border p-4"
              disabled={write.isPending}
            >
              <FieldLegend className="text-sm font-semibold">
                {providerNames[provider]}{" "}
                <Badge variant="secondary" className="ml-2 font-normal">
                  {tr(
                    snapshot.availability[provider]
                      ? "CLI available"
                      : "CLI not found",
                  )}
                </Badge>
              </FieldLegend>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-${provider}-executable`}>
                  {tr("Executable")}
                </FieldLabel>
                <Input
                  id={`${fieldId}-${provider}-executable`}
                  className="h-9"
                  value={draft.providers[provider].executable}
                  required
                  maxLength={2000}
                  onChange={(event) =>
                    change(provider, { executable: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-${provider}-model`}>
                  {tr("Model ID")}
                </FieldLabel>
                <Input
                  id={`${fieldId}-${provider}-model`}
                  className="h-9"
                  value={draft.providers[provider].model}
                  maxLength={200}
                  placeholder={tr("CLI default")}
                  onChange={(event) =>
                    change(provider, { model: event.target.value })
                  }
                />
              </Field>
              {provider === "codex" && (
                <>
                  {!!models.data?.length && (
                    <ChatSelect
                      label={tr("Available models")}
                      value={draft.providers.codex.model || "__default__"}
                      onValueChange={(value) =>
                        change("codex", {
                          model: value === "__default__" ? "" : value,
                        })
                      }
                      options={[
                        { value: "__default__", label: tr("CLI default") },
                        ...models.data.map((model) => ({
                          value: model.id,
                          label: model.display_name,
                        })),
                        ...(draft.providers.codex.model && !codexModel
                          ? [
                              {
                                value: draft.providers.codex.model,
                                label: draft.providers.codex.model,
                              },
                            ]
                          : []),
                      ]}
                      disabled={write.isPending}
                    />
                  )}
                  <ChatSelect
                    label={tr("Reasoning effort")}
                    value={draft.providers.codex.reasoning_effort}
                    disabled={write.isPending}
                    onValueChange={(value) =>
                      change("codex", {
                        reasoning_effort:
                          value as AgentSettingsOutput["providers"]["codex"]["reasoning_effort"],
                      })
                    }
                    options={[
                      { value: "default", label: tr("CLI default") },
                      ...[
                        ...new Set([
                          ...efforts,
                          ...(draft.providers.codex.reasoning_effort !==
                          "default"
                            ? [draft.providers.codex.reasoning_effort]
                            : []),
                        ]),
                      ].map((effort) => ({ value: effort, label: effort })),
                    ]}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      models.isFetching ||
                      !snapshot.availability.codex ||
                      !snapshot.enabled
                    }
                    onClick={() => void models.refetch()}
                  >
                    {tr("Refresh models")}
                  </Button>
                  {models.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {models.error.message}
                    </p>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {tr(
                      "The catalog uses the saved executable. Save a changed path first. An empty model ID uses the CLI default.",
                    )}
                  </p>
                </>
              )}
            </FieldSet>
          ))}
          {write.error && (
            <div role="alert" className="text-sm text-destructive">
              {write.error.message}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {write.error && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(snapshot.settings);
                setVersion(snapshot.version);
                write.reset();
              }}
            >
              {tr("Reload settings")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={write.isPending}
            onClick={onClose}
          >
            {tr("Cancel")}
          </Button>
          <Button type="submit" disabled={write.isPending}>
            {tr(write.isPending ? "Saving…" : "Save")}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Modal>
  );
}
