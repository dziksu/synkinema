import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Mic } from "lucide-react";
import { reads } from "./api/queries";
import { writes } from "./api/mutations";
import type { VoiceRequest } from "./api/generated/client";
import { tr, useLocale } from "./i18n";

export default function VoiceGenerator({
  text,
  projectId,
  children,
  busy = false,
}: {
  text: string;
  projectId: string;
  busy?: boolean;
  children?: (settings: {
    request: (text: string) => VoiceRequest;
    canGenerate: (text: string) => boolean;
    limit: number;
  }) => ReactNode;
}) {
  useLocale();
  const query = useQueryClient();
  const status = useQuery(reads.voiceStatus());
  const [choice, setChoice] = useState<VoiceRequest["provider"]>();
  const providerId = choice ?? status.data?.default_provider ?? "supertonic";
  const provider = status.data?.providers.find((p) => p.id === providerId);
  const local = providerId === "supertonic";
  const [voiceId, setVoiceId] = useState("");
  const [preset, setPreset] = useState("F1");
  const [language, setLanguage] = useState<
    NonNullable<VoiceRequest["language"]> | ""
  >("");
  const [speed, setSpeed] = useState(1);
  const [steps, setSteps] = useState(8);
  const generate = useMutation(writes.voice(query));
  const canGenerate = (text: string) =>
    !!provider?.configured &&
    !!text.trim() &&
    text.length <= provider.input_limit &&
    (local
      ? provider.languages.some((l) => l.id === language) &&
        provider.voices.some((v) => v.id === preset)
      : !!voiceId.trim());
  const request = (text: string): VoiceRequest => ({
    text,
    provider: providerId,
    voice_id: local ? preset : voiceId.trim(),
    model_id: provider?.model_id,
    speed,
    project_id: projectId,
    ...(local
      ? { language: language as NonNullable<VoiceRequest["language"]>, steps }
      : {}),
  });
  const pending = busy || generate.isPending;
  return (
    <>
      <section className="voice-generator">
        <h3>{children ? tr("Voice settings") : tr("Voiceover")}</h3>
        {status.isError && (
          <p role="alert" className="warning">
            {tr("Voice providers unavailable.")}{" "}
            <button
              className="text-button"
              onClick={() => void status.refetch()}
            >
              {tr("Retry")}
            </button>
          </p>
        )}
        <div className="field-grid">
          <label className="field">
            {tr("Speech provider")}
            <select
              aria-label={tr("Speech provider")}
              value={providerId}
              disabled={!status.data || pending}
              onChange={(e) => {
                setChoice(e.target.value as VoiceRequest["provider"]);
                setSpeed(1);
                generate.reset();
              }}
            >
              {(status.data?.providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.local ? ` · ${tr("Local")}` : ""}
                </option>
              ))}
            </select>
          </label>
          {local ? (
            <label className="field">
              {tr("Speech language")}
              <select
                value={language}
                disabled={pending}
                onChange={(e) => {
                  setLanguage(e.target.value as typeof language);
                  generate.reset();
                }}
              >
                <option value="">{tr("Select a supported language")}</option>
                {provider?.languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              {tr("Voice ID")}
              <input
                value={voiceId}
                disabled={pending}
                onChange={(e) => {
                  setVoiceId(e.target.value);
                  generate.reset();
                }}
                placeholder={tr("voice_id from your ElevenLabs account")}
              />
            </label>
          )}
        </div>
        <p className="hint">
          {local
            ? tr(
                "Speech is generated locally. Choose the language of your text; unsupported languages and automatic fallback are disabled.",
              )
            : tr(
                "ElevenLabs sends this text to the provider and uses your account credits.",
              )}
        </p>
        {local && (
          <div className="field-grid">
            <label className="field">
              {tr("Voice preset")}
              <select
                value={preset}
                disabled={pending}
                onChange={(e) => {
                  setPreset(e.target.value);
                  generate.reset();
                }}
              >
                {provider?.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {tr("Speech quality")}
              <select
                value={steps}
                disabled={pending}
                onChange={(e) => {
                  setSteps(Number(e.target.value));
                  generate.reset();
                }}
              >
                <option value={5}>{tr("Fast")}</option>
                <option value={8}>{tr("Balanced")}</option>
                <option value={12}>{tr("High")}</option>
              </select>
            </label>
          </div>
        )}
        <label className="field">
          {tr("Speech speed")} · {speed.toFixed(2)}×
          <input
            aria-label={tr("Speech speed")}
            type="range"
            min={0.7}
            max={local ? 2 : 1.2}
            step={0.05}
            value={speed}
            disabled={pending}
            onChange={(e) => {
              setSpeed(Number(e.target.value));
              generate.reset();
            }}
          />
        </label>
        {!children && (
          <div className="voice-generator-actions">
            <button
              className="button primary"
              disabled={!canGenerate(text) || pending}
              onClick={() => generate.mutate(request(text))}
            >
              {generate.isPending ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Mic size={16} />
              )}
              {generate.isPending
                ? tr("Generating voiceover…")
                : tr("Generate into project media")}
            </button>
            <span
              className={
                provider && text.length > provider.input_limit
                  ? "warning"
                  : "hint"
              }
            >
              {tr("{{count}} / {{limit}} characters", {
                count: text.length,
                limit: provider?.input_limit ?? 0,
              })}
            </span>
          </div>
        )}
        {provider && !provider.configured && (
          <p className="hint">
            {local
              ? tr(
                  "Install the Supertonic SDK and pinned model on the server to enable local speech.",
                )
              : tr(
                  "Set ELEVENLABS_API_KEY in the server environment to enable generation.",
                )}
          </p>
        )}
        {generate.isError && (
          <p role="alert" className="warning">
            {generate.error.message}
          </p>
        )}
        {generate.data && (
          <div className="voice-result">
            <p className="success">
              {tr(
                "The recording is in project media. Drag it onto a voiceover track.",
              )}
            </p>
            <audio
              controls
              src={generate.data.asset.url}
              aria-label={tr("Generated voiceover")}
            />
            <small>
              {tr("AI-generated audio")} · {generate.data.asset.name}
            </small>
          </div>
        )}
        {local && provider && (
          <p className="hint">
            {tr(
              "Supertonic is archived upstream. Published audio must be identified as AI-generated.",
            )}{" "}
            <a href={provider.license_url} target="_blank" rel="noreferrer">
              {tr("Model license")}
            </a>
          </p>
        )}
      </section>
      {children?.({ request, canGenerate, limit: provider?.input_limit ?? 0 })}
    </>
  );
}
