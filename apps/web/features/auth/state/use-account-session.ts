import { create } from "zustand";
import { type AccountSession } from "../types";

interface AccountSessionState {
  /** `null` while loading. */
  session: AccountSession | null;
  /** The learner was signed in on an earlier visit and the session has since ended. */
  expired: boolean;
  dismissExpired: () => void;
}

export const useAccountSession = create<AccountSessionState>()((set) => ({
  session: null,
  expired: false,
  dismissExpired: () => {
    set({ expired: false });
  },
}));

/**
 * Remembers (in this browser only) that the learner was signed in, so a session that ended on its
 * own can be told apart from one that was never there. Holds no account data.
 */
export const SIGNED_IN_HINT_KEY = "gitdojo:signed-in";

function readHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Storage blocked: the expired-session notice is simply not shown.
  }
}

const UNAVAILABLE: AccountSession = { status: "unconfigured" };

function isAccountSession(value: unknown): value is AccountSession {
  if (typeof value !== "object" || value === null) return false;
  const { status } = value as { status?: unknown };
  return status === "unconfigured" || status === "signed-out" || status === "signed-in";
}

let loading: Promise<void> | null = null;

/** Loads the account state once per page load. Learning never waits for it. */
export function loadAccountSession(fetcher: typeof fetch = fetch): Promise<void> {
  loading ??= (async () => {
    let session: AccountSession = UNAVAILABLE;
    try {
      const response = await fetcher("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body: unknown = response.ok ? await response.json() : null;
      if (isAccountSession(body)) session = body;
    } catch {
      // Offline or the endpoint failed: hide account controls rather than show a broken state.
    }
    const wasSignedIn = readHint();
    if (session.status !== "unconfigured") writeHint(session.status === "signed-in");
    useAccountSession.setState({
      session,
      expired: wasSignedIn && session.status === "signed-out",
    });
  })();
  return loading;
}

/** Called right before a deliberate sign-out, so it is not reported as an expired session. */
export function forgetSignedIn(): void {
  writeHint(false);
}

/** For tests. */
export function resetAccountSessionForTests(): void {
  loading = null;
  useAccountSession.setState({ session: null, expired: false });
}
