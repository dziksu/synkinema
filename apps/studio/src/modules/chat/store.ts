import type { AgentContextInput } from "@/api/generated/client";
import { create } from "zustand";

type Reference = {
  projectId: string;
  context: AgentContextInput;
  nonce: number;
};
type State = {
  open: boolean;
  selectedId: string | null;
  drafts: Record<string, string>;
  context: AgentContextInput | null;
  reference: Reference | null;
  set: (patch: Partial<State>) => void;
  ask: (projectId: string, context: AgentContextInput) => void;
};
export const useChatDock = create<State>((set) => ({
  open: false,
  selectedId: null,
  drafts: {},
  context: null,
  reference: null,
  set,
  ask: (projectId, context) =>
    set({ open: true, reference: { projectId, context, nonce: Date.now() } }),
}));
