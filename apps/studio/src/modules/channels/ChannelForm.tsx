import type { Channel, ChannelInput } from "@/api/generated/client";
import { writes } from "@/api/mutations";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormDraft } from "@/hooks/use-form-draft";
import { tr } from "@/lib/i18n";
import ChannelAvatar from "@/modules/channels/ChannelAvatar";
import ChannelLinksEditor from "@/modules/channels/ChannelLinksEditor";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function inputOf(channel?: Channel): ChannelInput {
  if (!channel)
    return {
      name: "",
      language: "en",
      voice_gender: "unspecified",
      lowercase_hashtags: true,
      links: [],
    };
  const {
    id: _id,
    version: _version,
    created_at: _created,
    updated_at: _updated,
    ...input
  } = channel;
  return input;
}
export function ChannelForm({
  channel,
  onSaved,
  onCancel,
}: {
  channel?: Channel;
  onSaved: (c: Channel) => void;
  onCancel: () => void;
}) {
  const client = useQueryClient();
  const create = useMutation(writes.createChannel(client));
  const update = useMutation(writes.updateChannel(client));
  const logoUpload = useMutation(writes.uploadChannelLogo());
  const [logoError, setLogoError] = useState("");
  const [draft, setDraft, form] = useFormDraft(() => inputOf(channel));
  const [baseVersion, setBaseVersion] = useState(channel?.version);
  const busy = create.isPending || update.isPending || logoUpload.isPending;
  const error = create.error || update.error;
  const textFields = [
    ["audience", tr("Audience"), 4000],
    ["concept", tr("Concept"), 10000],
    ["tone", tr("Voice and tone"), 2000],
    ["hook_guidance", tr("Opening hooks"), 4000],
    ["cta_guidance", tr("Closing CTA"), 4000],
    ["visual_guidance", tr("Visual and pacing rules"), 4000],
    ["rules", tr("Standing editorial rules"), 20000],
    ["avoid", tr("Avoid"), 4000],
    ["learnings", tr("Approved lessons"), 10000],
  ] as const;
  async function uploadLogo(file: File) {
    setLogoError("");
    if (file.size > 5 * 1024 * 1024) {
      setLogoError(tr("Maximum logo size is 5 MiB"));
      return;
    }
    try {
      const logo = await logoUpload.mutateAsync(file);
      setDraft((current) => ({ ...current, logo_id: logo.id }));
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : String(error));
    }
  }
  async function save() {
    try {
      onSaved(
        channel
          ? await update.mutateAsync({
              channelId: channel.id,
              request: { ...draft, expected_version: baseVersion! },
            })
          : await create.mutateAsync(draft),
      );
    } catch {
      /* Keep draft visible on failure. */
    }
  }
  return (
    <form className="channel-form" onSubmit={form.handleSubmit(save)}>
      <h2>{channel ? tr("Edit channel brief") : tr("New channel")}</h2>
      <p>
        {tr(
          "Keep creative rules here, not credentials. Platform links are references only.",
        )}
      </p>
      {channel && channel.version !== baseVersion && !busy && (
        <div role="alert" className="error-banner">
          {tr(
            "This channel changed. Your draft is preserved. Reload the latest version before editing again.",
          )}
          <Button
            variant="outline"
            type="button"
            className="button"
            onClick={() => {
              setDraft(inputOf(channel));
              setBaseVersion(channel.version);
              update.reset();
            }}
          >
            {tr("Discard draft and reload")}
          </Button>
        </div>
      )}
      <nav className="channel-form-nav" aria-label={tr("Brief sections")}>
        {[
          ["identity", tr("Identity and voice")],
          ["direction", tr("Audience and concept")],
          ["production", tr("Production guidance")],
          ["rules", tr("Rules and learning")],
          ["platforms", tr("Platform links")],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() =>
              document
                .getElementById(`channel-${id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <fieldset disabled={busy}>
        <section className="channel-form-section" id="channel-identity">
          <h3>{tr("Identity and voice")}</h3>
          <div className="channel-logo-editor">
            <ChannelAvatar name={draft.name} logoId={draft.logo_id} large />
            <div>
              <label className="field">
                {tr("Channel logo")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby="channel-logo-help"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <p id="channel-logo-help" className="channel-help">
                {tr(
                  "PNG, JPEG or WebP, up to 5 MiB. Upload first, then Save channel to apply.",
                )}
              </p>
              {logoUpload.isPending && (
                <p role="status">{tr("Uploading logo…")}</p>
              )}
              {logoError && (
                <p role="alert" className="error-banner">
                  {logoError}
                </p>
              )}
              {draft.logo_id && (
                <Button
                  variant="ghost"
                  type="button"
                  className="button subtle"
                  onClick={() => setDraft({ ...draft, logo_id: null })}
                >
                  {tr("Remove logo")}
                </Button>
              )}
            </div>
          </div>
          <p className="channel-help">
            {tr(
              "Set the language and narration defaults agents should follow.",
            )}
          </p>
          <div className="channel-form-grid">
            <label className="field">
              {tr("Channel name")}
              <Input
                required
                maxLength={200}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              {tr("Content language")}
              <Input
                required
                maxLength={50}
                list="channel-languages"
                value={draft.language}
                onChange={(e) =>
                  setDraft({ ...draft, language: e.target.value })
                }
              />
              <datalist id="channel-languages">
                <option value="en">{tr("English")}</option>
                <option value="pl">{tr("Polish")}</option>
                <option value="es">{tr("Spanish")}</option>
                <option value="de">{tr("German")}</option>
                <option value="fr">{tr("French")}</option>
              </datalist>
            </label>
            <label className="field">
              {tr("Preferred voice")}
              <NativeSelect
                value={draft.voice_gender}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    voice_gender: e.target
                      .value as ChannelInput["voice_gender"],
                  })
                }
              >
                <option value="unspecified">{tr("No preference")}</option>
                <option value="male">{tr("Male")}</option>
                <option value="female">{tr("Female")}</option>
                <option value="neutral">{tr("Neutral")}</option>
              </NativeSelect>
            </label>
            <label className="field">
              {tr("Preferred TTS provider ID")}
              <Input
                maxLength={100}
                value={draft.voice_provider || ""}
                onChange={(e) =>
                  setDraft({ ...draft, voice_provider: e.target.value })
                }
              />
            </label>
            <label className="field">
              {tr("Preferred voice ID")}
              <Input
                maxLength={200}
                value={draft.voice_id || ""}
                onChange={(e) =>
                  setDraft({ ...draft, voice_id: e.target.value })
                }
              />
            </label>
          </div>
        </section>
        {(
          [
            ["direction", tr("Audience and concept"), ["audience", "concept"]],
            [
              "production",
              tr("Production guidance"),
              ["tone", "hook_guidance", "cta_guidance", "visual_guidance"],
            ],
            [
              "rules",
              tr("Rules and learning"),
              ["rules", "avoid", "learnings"],
            ],
          ] as const
        ).map(([section, title, fields]) => (
          <section
            className="channel-form-section"
            id={`channel-${section}`}
            key={section}
          >
            <h3>{title}</h3>
            {textFields
              .filter(([key]) => (fields as readonly string[]).includes(key))
              .map(([key, label, maxLength]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`brief-${key}`}>{label}</FieldLabel>
                  <Textarea
                    id={`brief-${key}`}
                    aria-describedby={`brief-${key}-hint`}
                    rows={key === "rules" ? 14 : 7}
                    maxLength={maxLength}
                    value={draft[key] || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                  <FieldDescription id={`brief-${key}-hint`}>
                    {tr("{{count}} / {{limit}} characters", {
                      count: (draft[key] || "").length,
                      limit: maxLength,
                    })}
                  </FieldDescription>
                </Field>
              ))}
          </section>
        ))}
        <label className="channel-check">
          <input
            type="checkbox"
            checked={draft.lowercase_hashtags ?? true}
            onChange={(e) =>
              setDraft({ ...draft, lowercase_hashtags: e.target.checked })
            }
          />
          {tr("Use lowercase hashtags")}
        </label>
        <ChannelLinksEditor
          links={draft.links || []}
          onChange={(links) => setDraft({ ...draft, links })}
        />
        {channel && (
          <label className="channel-check">
            <input
              type="checkbox"
              checked={draft.archived ?? false}
              onChange={(e) =>
                setDraft({ ...draft, archived: e.target.checked })
              }
            />
            {tr("Archive channel (keep projects and history)")}
          </label>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="error-banner">
          {error.message}
        </p>
      )}
      <div className="dialog-actions channel-save-bar">
        <Button
          variant="outline"
          className="button"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          {tr("Cancel")}
        </Button>
        <Button
          variant="default"
          className="button primary"
          disabled={
            busy ||
            !draft.name.trim() ||
            (channel !== undefined && channel.version !== baseVersion)
          }
        >
          {busy ? tr("Saving…") : tr("Save channel")}
        </Button>
      </div>
    </form>
  );
}
