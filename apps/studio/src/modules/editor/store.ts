import type { Clip } from "@/lib/types";
import type { SourceSelection } from "@/modules/editor/source/sourceInsert";
import { create } from "zustand";
export type AudioDraft = {
  trackId: string;
  clipId?: string;
  gain_db?: number;
  animations?: Clip["animations"];
};
export type EditorDestination = {
  page: "projects" | "studio" | "library" | "renders" | "settings" | "channels";
  projectId: string | null;
  channelId: string | null;
};
type State = EditorDestination & {
  /** Primary clip shown in the inspector; always part of selectedIds. */
  selectedId: string | null;
  selectedIds: string[];
  /** Linked selection: picture and its synced sound move together. */
  linking: boolean;
  time: number;
  playing: boolean;
  draggingAsset: string | null;
  draggingSource: SourceSelection | null;
  audioDraft: AudioDraft | null;
  set: (patch: Partial<State>) => void;
};
// Client-only editor state. Routing belongs to TanStack Router; no global listeners.
export const useStudio = create<State>((set) => ({
  page: "studio",
  projectId: null,
  channelId: null,
  selectedId: null,
  selectedIds: [],
  linking: true,
  time: 0,
  playing: false,
  draggingAsset: null,
  draggingSource: null,
  audioDraft: null,
  // Selecting one clip replaces a multi-selection unless selectedIds is explicit.
  set: (patch) =>
    set(
      "selectedId" in patch && !("selectedIds" in patch)
        ? { ...patch, selectedIds: patch.selectedId ? [patch.selectedId] : [] }
        : patch,
    ),
}));
