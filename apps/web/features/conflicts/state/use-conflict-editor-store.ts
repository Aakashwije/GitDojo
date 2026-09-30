import { create } from "zustand";

interface ConflictEditorStore {
  /** Path open in the conflict editor, or `null` when it is closed. */
  path: string | null;
  open: (path: string) => void;
  close: () => void;
}

/** Lets any panel (banner, working tree) open the single conflict editor dialog. */
export const useConflictEditorStore = create<ConflictEditorStore>()((set) => ({
  path: null,
  open: (path) => {
    set({ path });
  },
  close: () => {
    set({ path: null });
  },
}));
