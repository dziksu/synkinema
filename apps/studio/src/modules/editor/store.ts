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
  selectedId: string | null;
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
  time: 0,
  playing: false,
  draggingAsset: null,
  draggingSource: null,
  audioDraft: null,
  set: (patch) => set(patch),
}));
