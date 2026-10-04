import { forgetSignedIn } from "../state/use-account-session";

/**
 * Marks that the learner chose "Sign out", so /auth/sign-out signs out straight away. Opening
 * that page any other way (a link from elsewhere) asks first, so nobody can be signed out by a
 * stray link.
 */
const INTENT_KEY = "gitdojo:sign-out-intent";
const INTENT_TTL_MS = 30_000;

export function markSignOutIntent(now: number = Date.now()): void {
  forgetSignedIn();
  try {
    sessionStorage.setItem(INTENT_KEY, String(now));
  } catch {
    // Without storage the sign-out page asks for confirmation instead.
  }
}

/** True once, right after `markSignOutIntent`. */
export function consumeSignOutIntent(now: number = Date.now()): boolean {
  try {
    const value = Number(sessionStorage.getItem(INTENT_KEY));
    sessionStorage.removeItem(INTENT_KEY);
    return Number.isFinite(value) && value > 0 && now - value < INTENT_TTL_MS;
  } catch {
    return false;
  }
}
