import { create } from "zustand";
import { readRoute, routeHash, type Page } from "./navigation";
import type { SourceSelection } from "./sourceInsert";
import type { Clip } from "./types";
export type AudioDraft = {
  trackId: string;
  clipId?: string;
  gain_db?: number;
  animations?: Clip["animations"];
};
type State = {
  channelId: string | null;
  projectId: string | null;
  selectedId: string | null;
  time: number;
  playing: boolean;
  draggingAsset: string | null;
  draggingSource: SourceSelection | null;
  page: Page;
  audioDraft: AudioDraft | null;
  set: (patch: Partial<State>) => void;
};
export const useStudio = create<State>((set, get) => ({
  channelId: readRoute(window.location.hash).channelId || null,
  projectId: readRoute(window.location.hash).projectId,
  selectedId: null,
  time: 0,
  playing: false,
  draggingAsset: null,
  draggingSource: null,
  page: readRoute(window.location.hash).page,
  audioDraft: null,
  set: (patch) => {
    const current = get(),
      next = { ...current, ...patch };
    if (
      next.page !== current.page ||
      next.projectId !== current.projectId ||
      next.channelId !== current.channelId
    ) {
      const hash = routeHash(next);
      if (window.location.hash !== hash)
        window.history.pushState(null, "", hash);
    }
    set(
      next.projectId !== current.projectId
        ? { ...patch, audioDraft: null }
        : patch,
    );
  },
}));

window.addEventListener("hashchange", () => {
  const route = readRoute(window.location.hash);
  useStudio.setState({
    ...route,
    channelId: route.channelId || null,
    selectedId: null,
    time: 0,
    playing: false,
    draggingAsset: null,
    draggingSource: null,
    audioDraft: null,
  });
});
