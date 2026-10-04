import {
  applyProgressAction,
  completionXp,
  contentKey,
  exportProgress,
  type ContentRef,
  type LocalProgress,
  type Persistence,
  type ProgressAction,
  type ProgressCatalog,
  type ProgressExport,
  type ProgressRepository,
} from "@gitdojo/progress";
import { useMemo } from "react";
import { create } from "zustand";
import { createBrowserProgressRepository } from "../services/browser-progress";

export type ProgressStatus = "loading" | "ready";

/** XP a completion just earned: 0 when the content had been completed before. */
export interface CompletionAward {
  key: string;
  xp: number;
}

interface ProgressState {
  /** `null` until saved progress has been read. */
  progress: LocalProgress | null;
  status: ProgressStatus;
  persistence: Persistence | null;
  /** Set when a save failed; cleared by the next successful save. */
  saveError: string | null;
  catalog: ProgressCatalog | null;
  lastAward: CompletionAward | null;
  /** True while changes are being written. */
  saving: boolean;
}

/**
 * Reactive view of local progress. Persistence lives in `@gitdojo/progress`; this store only
 * mirrors it for React. Changes are shown immediately and then replaced by what was saved,
 * which also includes anything other tabs saved in the meantime.
 */
export const useProgressStore = create<ProgressState>()(() => ({
  progress: null,
  status: "loading",
  persistence: null,
  saveError: null,
  catalog: null,
  lastAward: null,
  saving: false,
}));

let repository: ProgressRepository | null = null;
/** Actions recorded before the repository existed (child effects run before the provider's). */
let pending: ProgressAction[] = [];
/** Saves not finished yet; while any are running the optimistic state is kept. */
let inFlight = 0;

const SAVE_ERROR =
  "GitDojo couldn't save your latest progress. It is kept while this tab stays open.";

function award(progress: LocalProgress | null, action: ProgressAction): void {
  if (action.type !== "complete" || progress === null) return;
  const { content } = action;
  const field = content.kind === "lesson" ? "completedLessons" : "completedChallenges";
  const already = progress[field][content.id] !== undefined;
  useProgressStore.setState({
    lastAward: { key: contentKey(content), xp: already ? 0 : completionXp(content) },
  });
}

function save(action: ProgressAction): Promise<void> {
  const target = repository;
  if (!target) return Promise.resolve();
  inFlight += 1;
  useProgressStore.setState({ saving: true });
  return target.apply(action).then(
    (saved) => {
      inFlight -= 1;
      // Earlier results would hide changes still being saved; the last one includes them all.
      if (inFlight === 0) {
        useProgressStore.setState({ progress: saved, saveError: null, saving: false });
      }
    },
    (error: unknown) => {
      inFlight -= 1;
      console.error("[gitdojo] could not save progress", error);
      useProgressStore.setState({ saveError: SAVE_ERROR, saving: inFlight > 0 });
    },
  );
}

/**
 * Records learning activity. Safe to call at any time: before progress has loaded, actions wait
 * and are applied in order once it has.
 */
export function recordProgress(action: ProgressAction): Promise<void> {
  const { progress } = useProgressStore.getState();
  if (!repository || progress === null) {
    pending.push(action);
    return Promise.resolve();
  }
  award(progress, action);
  useProgressStore.setState({ progress: applyProgressAction(progress, action, Date.now()) });
  return save(action);
}

export function recordCompletion(content: ContentRef): Promise<void> {
  return recordProgress({ type: "complete", content });
}

let initialization: Promise<void> | null = null;

/** Loads progress once per page load. Later calls only refresh the catalog. */
export function initProgress(
  catalog: ProgressCatalog,
  createRepository: (
    catalog: ProgressCatalog,
  ) => ProgressRepository = createBrowserProgressRepository,
): Promise<void> {
  useProgressStore.setState({ catalog });
  initialization ??= (async () => {
    repository = createRepository(catalog);
    repository.subscribe((progress) => {
      // A save in progress here will return the merged result anyway.
      if (inFlight === 0) useProgressStore.setState({ progress });
    });
    const loaded = await repository.load();
    if (loaded.issues.length > 0) {
      console.warn("[gitdojo] repaired saved progress", loaded.issues);
    }
    useProgressStore.setState({
      progress: loaded.progress,
      persistence: loaded.persistence,
      status: "ready",
    });
    const queued = pending;
    pending = [];
    for (const action of queued) void recordProgress(action);
  })();
  return initialization;
}

/** Clears learning progress. Playground repositories and settings are not touched. */
export async function resetProgress(): Promise<void> {
  const { progress } = useProgressStore.getState();
  if (!repository || progress === null) return;
  useProgressStore.setState({ lastAward: null });
  await recordProgress({ type: "reset" });
}

/** The versioned JSON snapshot offered for download. */
export function exportCurrentProgress(now: number = Date.now()): ProgressExport | null {
  const { progress } = useProgressStore.getState();
  return progress ? exportProgress(progress, now) : null;
}

/** Forgets the repository, for tests. */
export function resetProgressStoreForTests(): void {
  repository?.close();
  repository = null;
  pending = [];
  inFlight = 0;
  initialization = null;
  useProgressStore.setState({
    progress: null,
    status: "loading",
    persistence: null,
    saveError: null,
    catalog: null,
    lastAward: null,
    saving: false,
  });
}

const EMPTY: ReadonlySet<string> = new Set();

/** Completed lesson ids, empty until saved progress has loaded. */
export function useCompletedLessons(): { completed: ReadonlySet<string>; hydrated: boolean } {
  const lessons = useProgressStore((state) => state.progress?.completedLessons);
  const hydrated = useProgressStore((state) => state.status === "ready");
  const completed = useMemo(() => (lessons ? new Set(Object.keys(lessons)) : EMPTY), [lessons]);
  return { completed, hydrated };
}

/** Completed standalone challenge ids, empty until saved progress has loaded. */
export function useCompletedChallenges(): { completed: ReadonlySet<string>; hydrated: boolean } {
  const challenges = useProgressStore((state) => state.progress?.completedChallenges);
  const hydrated = useProgressStore((state) => state.status === "ready");
  const completed = useMemo(
    () => (challenges ? new Set(Object.keys(challenges)) : EMPTY),
    [challenges],
  );
  return { completed, hydrated };
}
