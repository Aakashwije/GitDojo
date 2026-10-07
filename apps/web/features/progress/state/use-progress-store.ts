import {
  ANONYMOUS,
  applyProgressAction,
  completionXp,
  contentKey,
  createMemoryStorage,
  exportProgress,
  indexLessons,
  ProgressRepository,
  type ContentRef,
  type LocalProgress,
  type Persistence,
  type ProgressAction,
  type ProgressCatalog,
  type ProgressExport,
  type ProgressOwner,
} from "@gitdojo/progress";
import { useMemo } from "react";
import { create } from "zustand";
import { loadAccountSession, useAccountSession } from "@/features/auth/state/use-account-session";
import {
  fetchAccountProgress,
  uploadLessonCompletion,
  type AccountLessons,
} from "../services/account-progress";
import { createBrowserProgressRepository } from "../services/browser-progress";

export type ProgressStatus = "loading" | "ready";

/**
 * Whose progress is shown. `account`: a signed-in learner, with lesson completions saved to their
 * account and a per-account cache in this browser. `account-unavailable`: signed in, but the
 * account could not be read; this visit's progress is kept in memory and still sent to the
 * account. Anonymous progress is never shown to, or merged into, an account.
 */
export type ProgressMode = "anonymous" | "account" | "account-unavailable";

/** Why account progress is not up to date, shown to the learner. */
export type AccountNotice = "session-ended" | "unavailable" | "load-failed";

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
  /** True while changes are being written, locally or to the account. */
  saving: boolean;
  mode: ProgressMode;
  accountNotice: AccountNotice | null;
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
  mode: "anonymous",
  accountNotice: null,
}));

let repository: ProgressRepository | null = null;
/** Actions recorded before the repository existed (child effects run before the provider's). */
let pending: ProgressAction[] = [];
/** Saves not finished yet; while any are running the optimistic state is kept. */
let inFlight = 0;
/** Account uploads not finished yet. */
let uploading = 0;
let accountFetch: typeof fetch | undefined;

function updateSaving(): void {
  useProgressStore.setState({ saving: inFlight > 0 || uploading > 0 });
}

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
  updateSaving();
  return target.apply(action).then(
    (saved) => {
      inFlight -= 1;
      // Earlier results would hide changes still being saved; the last one includes them all.
      if (inFlight === 0) useProgressStore.setState({ progress: saved, saveError: null });
      updateSaving();
    },
    (error: unknown) => {
      inFlight -= 1;
      console.error("[gitdojo] could not save progress", error);
      useProgressStore.setState({ saveError: SAVE_ERROR });
      updateSaving();
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
  // Only a first completion goes to the account; replays never send (or earn) anything again.
  const upload =
    action.type === "complete" &&
    progress[action.content.kind === "lesson" ? "completedLessons" : "completedChallenges"][
      action.content.id
    ] === undefined &&
    useProgressStore.getState().mode !== "anonymous";
  useProgressStore.setState({ progress: applyProgressAction(progress, action, Date.now()) });
  const saved = save(action);
  if (upload) void uploadLesson(action.content.id, action.content.kind);
  return saved;
}

/**
 * Sends a lesson completion to the account and adopts the account's record. Failures leave the
 * completion in this browser's account cache, which is uploaded again on the next visit.
 */
async function uploadLesson(
  lessonId: string,
  kind: "lesson" | "challenge" = "lesson",
): Promise<boolean> {
  uploading += 1;
  updateSaving();
  try {
    const result = await uploadLessonCompletion(lessonId, accountFetch, kind);
    switch (result.status) {
      case "ok":
        await save({
          type: "account-lessons",
          lessons: kind === "lesson" ? { [result.lessonId]: result.record } : {},
          ...(kind === "challenge" ? { challenges: { [result.lessonId]: result.record } } : {}),
        });
        if (useProgressStore.getState().accountNotice !== "load-failed") {
          useProgressStore.setState({ accountNotice: null });
        }
        return true;
      case "signed-out":
        useProgressStore.setState({ accountNotice: "session-ended" });
        return false;
      case "unavailable":
        useProgressStore.setState({ accountNotice: "unavailable" });
        return false;
      case "rejected":
        console.warn("[gitdojo] the account did not accept a lesson completion");
        return true;
    }
  } finally {
    uploading -= 1;
    updateSaving();
  }
}

/** Uploads lessons completed in this browser that the account does not have yet. */
async function uploadPending(
  progress: LocalProgress,
  account: AccountLessons,
  catalog: ProgressCatalog,
  challenges: AccountLessons = {},
): Promise<void> {
  const lessons = indexLessons(catalog);
  for (const id of Object.keys(progress.completedLessons)) {
    if (account[id] !== undefined || !lessons.has(id)) continue;
    if (!(await uploadLesson(id))) return;
  }
  for (const id of Object.keys(progress.completedChallenges)) {
    if (challenges[id] !== undefined || !catalog.challenges.some((c) => c.id === id)) continue;
    if (!(await uploadLesson(id, "challenge"))) return;
  }
}

export function recordCompletion(content: ContentRef): Promise<void> {
  return recordProgress({ type: "complete", content });
}

let initialization: Promise<void> | null = null;

/** Whose progress to load, decided before anything is read or written. */
export type AccountResolution =
  | { kind: "anonymous"; notice?: AccountNotice }
  | { kind: "account"; accountId: string; lessons: AccountLessons; challenges?: AccountLessons }
  | { kind: "unavailable" };

/** Anonymous progress only: the default, for pages and tests without accounts. */
export const anonymousOnly = (): Promise<AccountResolution> =>
  Promise.resolve({ kind: "anonymous" });

const ACCOUNT_TIMEOUT_MS = 10_000;

/**
 * Asks the server who the learner is (the same request the header makes) and, when signed in,
 * reads their account progress. If this takes too long the learner is treated as signed in but
 * unavailable, never as anonymous, so account activity is not written to anonymous progress.
 */
export function resolveBrowserAccount(
  fetcher: typeof fetch = fetch,
  timeoutMs = ACCOUNT_TIMEOUT_MS,
): Promise<AccountResolution> {
  const resolve = async (): Promise<AccountResolution> => {
    await loadAccountSession(fetcher);
    if (useAccountSession.getState().session?.status !== "signed-in") return { kind: "anonymous" };
    const result = await fetchAccountProgress(fetcher);
    if (result.status === "ok") {
      return {
        kind: "account",
        accountId: result.accountId,
        lessons: result.lessons,
        challenges: result.challenges,
      };
    }
    return result.status === "signed-out"
      ? { kind: "anonymous", notice: "session-ended" }
      : { kind: "unavailable" };
  };
  return new Promise((done) => {
    const timer = setTimeout(() => {
      done({ kind: "unavailable" });
    }, timeoutMs);
    void resolve().then((resolution) => {
      clearTimeout(timer);
      done(resolution);
    });
  });
}

export interface InitProgressOptions {
  /** Defaults to anonymous progress only. The app passes {@link resolveBrowserAccount}. */
  resolveAccount?: () => Promise<AccountResolution>;
  /** For account requests; tests replace it. */
  fetcher?: typeof fetch;
}

/** Loads progress once per page load. Later calls only refresh the catalog. */
export function initProgress(
  catalog: ProgressCatalog,
  createRepository: (
    catalog: ProgressCatalog,
    owner: ProgressOwner,
  ) => ProgressRepository = createBrowserProgressRepository,
  { resolveAccount = anonymousOnly, fetcher }: InitProgressOptions = {},
): Promise<void> {
  useProgressStore.setState({ catalog });
  initialization ??= (async () => {
    accountFetch = fetcher;
    const account = await resolveAccount();
    if (account.kind === "account") {
      repository = createRepository(catalog, { kind: "account", accountId: account.accountId });
    } else if (account.kind === "unavailable") {
      // Unknown account: nothing is persisted locally, completions are still sent to the account.
      repository = new ProgressRepository({
        storage: createMemoryStorage(),
        catalog,
        owner: { kind: "account", accountId: "unavailable" },
      });
    } else {
      repository = createRepository(catalog, ANONYMOUS);
    }
    useProgressStore.setState({
      mode:
        account.kind === "anonymous"
          ? "anonymous"
          : account.kind === "account"
            ? "account"
            : "account-unavailable",
      accountNotice:
        account.kind === "unavailable"
          ? "load-failed"
          : account.kind === "anonymous"
            ? (account.notice ?? null)
            : null,
    });
    repository.subscribe((progress) => {
      // A save in progress here will return the merged result anyway.
      if (inFlight === 0) useProgressStore.setState({ progress });
    });
    const loaded = await repository.load();
    if (loaded.issues.length > 0) {
      console.warn("[gitdojo] repaired saved progress", loaded.issues);
    }
    let progress = loaded.progress;
    if (account.kind === "account") {
      // The account is the source of truth for lesson completions.
      progress = await repository
        .apply({
          type: "account-lessons",
          lessons: account.lessons,
          challenges: account.challenges,
        })
        .catch(() =>
          applyProgressAction(
            progress,
            { type: "account-lessons", lessons: account.lessons, challenges: account.challenges },
            Date.now(),
          ),
        );
    }
    useProgressStore.setState({ progress, persistence: loaded.persistence, status: "ready" });
    if (account.kind === "account")
      void uploadPending(progress, account.lessons, catalog, account.challenges);
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
  uploading = 0;
  accountFetch = undefined;
  initialization = null;
  useProgressStore.setState({
    progress: null,
    status: "loading",
    persistence: null,
    saveError: null,
    catalog: null,
    lastAward: null,
    saving: false,
    mode: "anonymous",
    accountNotice: null,
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
