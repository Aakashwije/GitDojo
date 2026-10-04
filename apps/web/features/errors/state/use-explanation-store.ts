import { type GitEducationalError } from "@gitdojo/shared-types";
import { create } from "zustand";

interface ExplanationStore {
  /** The explanation for the last command, if it deserved one. */
  explanation: GitEducationalError | null;
  /** "Why did this happen?" is open. */
  expanded: boolean;
  show: (explanation: GitEducationalError | null) => void;
  toggle: () => void;
  dismiss: () => void;
}

/** The educational explanation shown under the terminal after a command. */
export const useExplanationStore = create<ExplanationStore>()((set) => ({
  explanation: null,
  expanded: false,
  show: (explanation) => {
    set({ explanation, expanded: false });
  },
  toggle: () => {
    set((state) => ({ expanded: !state.expanded }));
  },
  dismiss: () => {
    set({ explanation: null, expanded: false });
  },
}));
