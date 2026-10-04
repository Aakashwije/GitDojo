import { create } from "zustand";

export type EditorTabStatus = "loading" | "ready" | "missing" | "error";

export interface EditorTab {
  path: string;
  status: EditorTabStatus;
  /** Content as last read from or written to the virtual filesystem. */
  saved: string;
  /** What the editor shows; differs from `saved` until the debounced save lands. */
  draft: string;
  saving: boolean;
  /** Why the last read or save failed. */
  error: string | null;
}

/** Which tool fills the workbench in lesson workspaces. */
export type WorkbenchView = "terminal" | "editor";

interface EditorStore {
  tabs: EditorTab[];
  activePath: string | null;
  view: WorkbenchView;
  /** Opens (or focuses) a tab and shows the editor. Content is loaded by the editor controller. */
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  setView: (view: WorkbenchView) => void;
  updateTab: (path: string, patch: Partial<Omit<EditorTab, "path">>) => void;
  /** Closes every tab, e.g. when another workspace loads or a lesson resets. */
  reset: () => void;
}

export function isDirty(tab: EditorTab): boolean {
  return tab.status === "ready" && tab.draft !== tab.saved;
}

/** Open editor tabs. Reading and saving files is done by `EditorController`. */
export const useEditorStore = create<EditorStore>()((set) => ({
  tabs: [],
  activePath: null,
  view: "terminal",
  openFile: (path) => {
    set((state) => ({
      view: "editor",
      activePath: path,
      tabs: state.tabs.some((tab) => tab.path === path)
        ? state.tabs
        : [
            ...state.tabs,
            { path, status: "loading", saved: "", draft: "", saving: false, error: null },
          ],
    }));
  },
  closeTab: (path) => {
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.path === path);
      if (index === -1) return state;
      const tabs = state.tabs.filter((tab) => tab.path !== path);
      // Like an IDE: closing the active tab activates its neighbour.
      const activePath =
        state.activePath === path
          ? (tabs[Math.min(index, tabs.length - 1)]?.path ?? null)
          : state.activePath;
      return { tabs, activePath };
    });
  },
  setActive: (activePath) => {
    set({ activePath });
  },
  setView: (view) => {
    set({ view });
  },
  updateTab: (path, patch) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, ...patch } : tab)),
    }));
  },
  reset: () => {
    set({ tabs: [], activePath: null, view: "terminal" });
  },
}));
