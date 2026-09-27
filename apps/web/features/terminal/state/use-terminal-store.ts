import { create } from "zustand";
import { appendEntry } from "../services/command-history";

interface TerminalStore {
  history: string[];
  /** Plain-text transcript of the latest output, announced to screen readers. */
  lastAnnouncement: string;
  pushHistory: (line: string) => void;
  announce: (text: string) => void;
}

export const useTerminalStore = create<TerminalStore>()((set) => ({
  history: [],
  lastAnnouncement: "",
  pushHistory: (line) => {
    set((state) => ({ history: appendEntry(state.history, line) }));
  },
  announce: (text) => {
    set({ lastAnnouncement: text });
  },
}));
