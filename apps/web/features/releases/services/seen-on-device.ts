import { isReleaseVersion } from "@gitdojo/progress";

/**
 * Releases seen in this browser, whoever was signed in. The learner's own record (anonymous
 * progress, or their account) is the source of truth and is what syncs; this per-browser copy
 * covers what that record cannot:
 *
 * - Signing out shows the anonymous record, which never receives account data. Without this,
 *   an announcement dismissed while signed in would come back after signing out.
 * - It is synchronous, so a returning learner never waits on the account to hide the banner.
 * - If IndexedDB is unavailable, a dismissal still holds across reloads; if localStorage is
 *   blocked too, it holds for this tab.
 *
 * It is never uploaded, so nothing from one person reaches another's account.
 */

const KEY = "gitdojo:seen-releases";
/** Only the current release matters; a few recent ones cover a rollback. */
const KEPT = 20;

/** Versions seen in this tab, for when localStorage cannot be written. */
const inThisTab = new Set<string>();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null;
  }
}

function readStored(): string[] {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isReleaseVersion) : [];
  } catch {
    return [];
  }
}

export function seenOnDevice(version: string): boolean {
  return inThisTab.has(version) || readStored().includes(version);
}

export function markSeenOnDevice(version: string): void {
  if (!isReleaseVersion(version)) return;
  inThisTab.add(version);
  try {
    const kept = [version, ...readStored().filter((seen) => seen !== version)].slice(0, KEPT);
    storage()?.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Full or blocked: this tab still remembers, and the learner's progress record is saved too.
  }
  for (const listener of listeners) listener();
}

/** Calls back when this tab or another one marks a release seen. */
export function subscribeSeenOnDevice(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forgets this tab's copy, for tests. */
export function resetSeenOnDeviceForTests(): void {
  inThisTab.clear();
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
