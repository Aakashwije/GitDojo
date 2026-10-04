import { applyProgressAction, type ProgressAction } from "./actions";
import { type ProgressCatalog } from "./catalog";
import {
  LEGACY_STORAGE_KEY,
  migrateLegacyProgress,
  parseLegacyProgress,
  type LegacyStorage,
} from "./migration";
import { ANONYMOUS, ownerKey, type LocalProgress, type ProgressOwner } from "./model";
import { NewerProgressVersionError, parseProgress } from "./parse";
import { createMemoryStorage, type ProgressStorage } from "./storage";

/** Cross-tab notifications; a `BroadcastChannel` satisfies this. */
export interface ProgressChannel {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export const PROGRESS_CHANNEL = "gitdojo:progress";

export type Persistence =
  /** Saved in IndexedDB. */
  | { mode: "saved" }
  /** IndexedDB could not be used: progress lasts until the tab closes. */
  | { mode: "memory"; reason: string };

export interface LoadedProgress {
  progress: LocalProgress;
  persistence: Persistence;
  /** Problems found (and repaired) in the stored record. */
  issues: string[];
}

export interface ProgressRepositoryOptions {
  storage: ProgressStorage;
  catalog: ProgressCatalog;
  /** Where the pre-IndexedDB progress may still be (localStorage). */
  legacy?: LegacyStorage | null;
  owner?: ProgressOwner;
  channel?: ProgressChannel | null;
  now?: () => number;
}

interface ChangeMessage {
  type: "progress-changed";
  key: string;
  revision: number;
}

function isChangeMessage(data: unknown): data is ChangeMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "progress-changed"
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Loads and saves one owner's progress. Operations run one at a time in this tab, and every
 * change is applied to the latest stored record inside a single transaction, so concurrent
 * updates (from this tab or others) are never lost. Other tabs are told about each change and
 * reload it.
 */
export class ProgressRepository {
  private storage: ProgressStorage;
  private readonly key: string;
  private readonly now: () => number;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(progress: LocalProgress) => void>();
  private persistence: Persistence = { mode: "saved" };
  private batch: {
    action: ProgressAction;
    resolve: (progress: LocalProgress) => void;
    reject: (error: Error) => void;
  }[] = [];
  private readonly onMessage = (event: { data: unknown }) => {
    if (!isChangeMessage(event.data) || event.data.key !== this.key) return;
    void this.enqueue(() => this.read()).then(
      (progress) => {
        for (const listener of this.listeners) listener(progress);
      },
      (error: unknown) => {
        console.warn("[gitdojo] could not reload progress changed in another tab", error);
      },
    );
  };

  constructor(private readonly options: ProgressRepositoryOptions) {
    this.storage = options.storage;
    this.key = ownerKey(options.owner ?? ANONYMOUS);
    this.now = options.now ?? Date.now;
    options.channel?.addEventListener("message", this.onMessage);
  }

  get persistenceMode(): Persistence {
    return this.persistence;
  }

  /**
   * Reads progress, repairing malformed data and importing legacy progress once. Never rejects
   * for storage problems: it falls back to memory and says why.
   */
  load(): Promise<LoadedProgress> {
    return this.enqueue(async () => {
      try {
        return await this.loadFrom(this.storage);
      } catch (error) {
        const reason =
          error instanceof NewerProgressVersionError
            ? "Your progress was saved by a newer version of GitDojo. Changes made here will not be saved."
            : "Your browser is not letting GitDojo save progress, so it will last only until you close this tab.";
        console.warn("[gitdojo] progress storage unavailable", error);
        this.storage = createMemoryStorage();
        this.persistence = { mode: "memory", reason };
        return this.loadFrom(this.storage);
      }
    });
  }

  /**
   * Applies one change to the latest saved progress and resolves with the saved result. Changes
   * made while a save is running are written together in the next transaction, so a burst of
   * activity (several commands, then a completion) costs at most two writes.
   */
  apply(action: ProgressAction): Promise<LocalProgress> {
    return new Promise<LocalProgress>((resolve, reject) => {
      this.batch.push({ action, resolve, reject });
      if (this.batch.length === 1) void this.enqueue(() => this.flush());
    });
  }

  private async flush(): Promise<void> {
    const batch = this.batch;
    this.batch = [];
    try {
      const now = this.now();
      // A box, not a `let`: TypeScript does not see assignments made inside the callback.
      const box: { saved?: LocalProgress } = {};
      await this.storage.update(this.key, (raw) => {
        const { progress, issues } = parseProgress(raw, now);
        const next = batch.reduce(
          (current, { action }) => applyProgressAction(current, action, now),
          progress,
        );
        box.saved = next;
        return next === progress && issues.length === 0 && raw !== undefined ? undefined : next;
      });
      const { saved } = box;
      if (saved === undefined) throw new Error("Progress update did not run");
      if (batch.some(({ action }) => action.type === "reset")) this.removeLegacy();
      this.announce(saved);
      for (const { resolve } of batch) resolve(saved);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const { reject } of batch) reject(failure);
    }
  }

  /** Learning progress only: playground repositories and other site data are untouched. */
  reset(): Promise<LocalProgress> {
    return this.apply({ type: "reset" });
  }

  /** Called with the latest progress whenever another tab changes it. */
  subscribe(listener: (progress: LocalProgress) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.options.channel?.removeEventListener("message", this.onMessage);
    this.listeners.clear();
  }

  private async loadFrom(storage: ProgressStorage): Promise<LoadedProgress> {
    const now = this.now();
    const legacy = this.readLegacy();
    const box: { loaded?: LoadedProgress; damaged?: unknown } = {};
    await storage.update(this.key, (raw) => {
      const { progress, issues } = parseProgress(raw, now);
      if (issues.length > 0) box.damaged = raw;
      const migrated = migrateLegacyProgress(progress, legacy, this.options.catalog, now);
      box.loaded = { progress: migrated, persistence: this.persistence, issues };
      const unchanged = raw !== undefined && issues.length === 0 && migrated === progress;
      return unchanged ? undefined : migrated;
    });
    const { loaded, damaged } = box;
    if (loaded === undefined) throw new Error("Progress load did not run");
    if (damaged !== undefined) {
      // Keep the unreadable original next to the repaired record, in case it is ever needed.
      await storage.write(`${this.key}:recovered:${String(now)}`, damaged).catch(() => undefined);
    }
    // Once the import is safely in IndexedDB the legacy copy is no longer needed. In memory mode
    // it stays: it is still the only saved copy.
    if (storage.kind === "indexeddb" && legacy !== null) this.removeLegacy();
    return loaded;
  }

  private async read(): Promise<LocalProgress> {
    return parseProgress(await this.storage.read(this.key), this.now()).progress;
  }

  private readLegacy() {
    try {
      return parseLegacyProgress(this.options.legacy?.getItem(LEGACY_STORAGE_KEY) ?? null);
    } catch (error) {
      console.warn("[gitdojo] could not read legacy progress", describe(error));
      return null;
    }
  }

  private removeLegacy(): void {
    try {
      this.options.legacy?.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // The migration marker already prevents a second import.
    }
  }

  private announce(progress: LocalProgress): void {
    if (this.storage.kind !== "indexeddb") return;
    try {
      this.options.channel?.postMessage({
        type: "progress-changed",
        key: this.key,
        revision: progress.revision,
      } satisfies ChangeMessage);
    } catch {
      // Other tabs pick the change up on their next load or write.
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
