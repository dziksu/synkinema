import en from "@/lib/locales/en.json";
import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

// Explicit English default: browser/OS locale must not change the interface.
// Add future catalogs here; media names, scripts and captions are user content.
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});

function syncDocumentLanguage() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = i18n.resolvedLanguage || "en";
    document.documentElement.dir = i18n.dir();
  }
}
i18n.on("languageChanged", syncDocumentLanguage);
syncDocumentLanguage();

// Non-React editing helpers use the same catalog as components.
export const tr = i18n.t.bind(i18n);

// Subscribe components to language changes, including dialogs rendered in portals.
export function useLocale() {
  return useTranslation(undefined, { i18n });
}

export function trackKindLabel(kind: string) {
  const labels: Record<string, string> = {
    video: tr("Video"),
    overlay: tr("Video overlay"),
    text: tr("Captions"),
    voiceover: tr("Voiceover"),
    music: tr("Music"),
    sound: tr("Audio"),
    ambient: tr("Ambience"),
  };
  return labels[kind] || kind;
}

export function jobStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: tr("Queued"),
    running: tr("Rendering"),
    completed: tr("Completed"),
    failed: tr("Failed"),
    cancelled: tr("Cancelled"),
  };
  return labels[status] || status;
}

export function renderPhaseLabel(phase: string) {
  const clip = /^Preparing clip (\d+)\/(\d+)$/.exec(phase);
  if (clip)
    return tr("Preparing clip {{current}}/{{total}}", {
      current: clip[1],
      total: clip[2],
    });
  const labels: Record<string, string> = {
    Queued: tr("Queued"),
    Starting: tr("Starting"),
    "Compositing timeline": tr("Compositing timeline"),
    "Measuring loudness · pass 1/2": tr("Measuring loudness · pass 1/2"),
    "Normalizing audio · pass 2/2": tr("Normalizing audio · pass 2/2"),
    "Checking encoded audio peaks": tr("Checking encoded audio peaks"),
  };
  return labels[phase] || jobStatusLabel(phase);
}

export function operationLabel(operation: string) {
  const labels: Record<string, string> = {
    create: tr("Create project"),
    update_project: tr("Update project"),
    add_track: tr("Add track"),
    reorder_tracks: tr("Reorder tracks"),
    remove_track: tr("Remove track"),
    update_track: tr("Update track"),
    add_clip: tr("Add clip"),
    append_clip: tr("Append clip"),
    duplicate_clip: tr("Duplicate clip"),
    extract_audio: tr("Extract audio"),
    update_clip: tr("Update clip"),
    move_clip: tr("Move clip"),
    trim_clip: tr("Trim clip"),
    set_transition: tr("Set transition"),
    split_clip: tr("Split clip"),
    remove_clip: tr("Remove clip"),
    restore_revision: tr("Restore revision"),
    batch: tr("Batch edit"),
  };
  // Unknown future server operations remain readable without changing IDs.
  return labels[operation] || operation.replaceAll("_", " ");
}
