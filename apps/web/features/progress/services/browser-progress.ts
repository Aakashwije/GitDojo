import {
  createIndexedDbStorage,
  PROGRESS_CHANNEL,
  ProgressRepository,
  type LegacyStorage,
  type ProgressCatalog,
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

/** Progress in IndexedDB, migrated from localStorage, synchronized across tabs. Browser only. */
export function createBrowserProgressRepository(catalog: ProgressCatalog): ProgressRepository {
  const factory = (globalThis.indexedDB as IDBFactory | undefined) ?? UNAVAILABLE;
  return new ProgressRepository({
    storage: createIndexedDbStorage(factory),
    catalog,
    legacy: localStorageOrNull(),
    channel:
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(PROGRESS_CHANNEL),
  });
}
