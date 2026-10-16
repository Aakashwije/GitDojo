import { type PendingEditorState } from "@gitdojo/shared-types";
import { create } from "zustand";

/** What the learner did with the file Git opened. */
export type GitEditorDecision = { action: "save"; content: string } | { action: "abort" };

interface GitEditorStore {
  /** The file Git is waiting on, while the editor dialog is open. */
  editor: PendingEditorState | null;
  resolve: ((decision: GitEditorDecision) => void) | null;
  /** Opens the dialog and resolves once the learner saves or aborts. */
  open: (editor: PendingEditorState) => Promise<GitEditorDecision>;
  answer: (decision: GitEditorDecision) => void;
}

/**
 * Real Git starts the learner's editor and waits for it to exit. Here a command that makes Git
 * wait (`git rebase -i`) asks this store for the edited text, and the terminal stays busy until
 * the learner saves or aborts, just as it would.
 */
export const useGitEditorStore = create<GitEditorStore>()((set, get) => ({
  editor: null,
  resolve: null,
  open: (editor) =>
    new Promise<GitEditorDecision>((resolve) => {
      // Only one editor can be waited on; an older request is cancelled, never left hanging.
      get().resolve?.({ action: "abort" });
      set({ editor, resolve });
    }),
  answer: (decision) => {
    const { resolve } = get();
    set({ editor: null, resolve: null });
    resolve?.(decision);
  },
}));
