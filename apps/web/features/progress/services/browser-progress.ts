import {
  ANONYMOUS,
  createIndexedDbStorage,
  PROGRESS_CHANNEL,
  ProgressRepository,
  type LegacyStorage,
  type ProgressCatalog,
  type ProgressOwner,
} from "@gitdojo/progress";

/** Stands in for IndexedDB where it does not exist, so the repository falls back to memory. */
const UNAVAILABLE: IDBFactory = {
  open: () => {
    throw new Error("IndexedDB is not available");
  },
} as unknown as IDBFactory;

function localStorageOrNull(): LegacyStorage | null {
  try {
    return window.localStorage;
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null;
  }
}

/**
 * One owner's progress in IndexedDB, synchronized across tabs. Browser only. Anonymous progress
 * also imports the pre-IndexedDB localStorage copy; an account's record never does, so anonymous
 * progress is never merged into an account.
 */
export function createBrowserProgressRepository(
  catalog: ProgressCatalog,
  owner: ProgressOwner = ANONYMOUS,
): ProgressRepository {
  const factory = (globalThis.indexedDB as IDBFactory | undefined) ?? UNAVAILABLE;
  return new ProgressRepository({
    storage: createIndexedDbStorage(factory),
    catalog,
    owner,
    legacy: owner.kind === "anonymous" ? localStorageOrNull() : null,
    channel:
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(PROGRESS_CHANNEL),
  });
}
