import { FileNotFoundError } from "@gitdojo/git-engine";
import { isDirty, useEditorStore, type EditorTab } from "../state/use-editor-store";

/** How the editor reaches the workspace. Every call goes through the session's queue. */
export interface WorkspaceFileActions {
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
  createFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
}

export const SAVE_DELAY_MS = 400;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

type EditorStoreApi = typeof useEditorStore;

/**
 * Keeps editor tabs and the virtual filesystem in sync:
 *
 * - typing updates the draft and saves after a short pause (or at once with Ctrl+S / on blur);
 * - after any command, clean tabs are re-read so `git restore`, `git switch`... show up;
 * - tabs with unsaved typing are never overwritten.
 */
export class EditorController {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private loading = new Set<string>();

  constructor(
    private readonly files: WorkspaceFileActions,
    private readonly store: EditorStoreApi = useEditorStore,
    private readonly delay = SAVE_DELAY_MS,
  ) {}

  private tab(path: string): EditorTab | undefined {
    return this.store.getState().tabs.find((tab) => tab.path === path);
  }

  /** Loads every tab still waiting for its content. Safe to call repeatedly. */
  async loadPending(): Promise<void> {
    const pending = this.store
      .getState()
      .tabs.filter((tab) => tab.status === "loading" && !this.loading.has(tab.path));
    await Promise.all(pending.map((tab) => this.read(tab.path, { initial: true })));
  }

  /** Re-reads every tab without unsaved typing, e.g. after a command changed the working tree. */
  async refresh(): Promise<void> {
    const tabs = this.store
      .getState()
      .tabs.filter((tab) => !isDirty(tab) && !tab.saving && !this.timers.has(tab.path));
    await Promise.all(tabs.map((tab) => this.read(tab.path, { initial: false })));
  }

  private async read(path: string, { initial }: { initial: boolean }): Promise<void> {
    if (this.loading.has(path)) return;
    this.loading.add(path);
    try {
      const content = await this.files.readFile(path);
      const tab = this.tab(path);
      // The learner may have started typing while the file was being read.
      if (!tab || (!initial && (isDirty(tab) || this.timers.has(path)))) return;
      if (tab.status === "ready" && tab.saved === content) return;
      this.store
        .getState()
        .updateTab(path, { status: "ready", saved: content, draft: content, error: null });
    } catch (error) {
      if (!this.tab(path)) return;
      this.store
        .getState()
        .updateTab(
          path,
          error instanceof FileNotFoundError
            ? { status: "missing", saved: "", draft: "", error: null }
            : { status: "error", error: describe(error) },
        );
    } finally {
      this.loading.delete(path);
    }
  }

  /** Records typing and schedules a save. */
  change(path: string, draft: string): void {
    const tab = this.tab(path);
    if (tab?.status !== "ready") return;
    this.store.getState().updateTab(path, { draft });
    const existing = this.timers.get(path);
    if (existing !== undefined) clearTimeout(existing);
    this.timers.set(
      path,
      setTimeout(() => {
        void this.save(path);
      }, this.delay),
    );
  }

  /** Saves a tab now if it has unsaved changes. */
  async save(path: string): Promise<void> {
    const timer = this.timers.get(path);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(path);

    const tab = this.tab(path);
    if (!tab || !isDirty(tab)) return;
    const content = tab.draft;
    this.store.getState().updateTab(path, { saving: true, error: null });
    try {
      await this.files.saveFile(path, content);
      this.store.getState().updateTab(path, { saving: false, saved: content });
    } catch (error) {
      this.store.getState().updateTab(path, { saving: false, error: describe(error) });
    }
  }

  /** Saves everything pending, e.g. before the learner runs a command. */
  async flush(): Promise<void> {
    const paths = new Set([
      ...this.timers.keys(),
      ...this.store
        .getState()
        .tabs.filter(isDirty)
        .map((tab) => tab.path),
    ]);
    await Promise.all([...paths].map((path) => this.save(path)));
  }

  async close(path: string): Promise<void> {
    await this.save(path);
    this.store.getState().closeTab(path);
  }

  async create(path: string): Promise<void> {
    await this.files.createFile(path);
    this.store.getState().openFile(path);
    await this.loadPending();
  }

  async remove(path: string): Promise<void> {
    const timer = this.timers.get(path);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(path);
    await this.files.deleteFile(path);
    this.store.getState().closeTab(path);
  }

  /** Called when the editor unmounts: typing still waiting for its save is written, not lost. */
  dispose(): void {
    void this.flush();
  }
}
