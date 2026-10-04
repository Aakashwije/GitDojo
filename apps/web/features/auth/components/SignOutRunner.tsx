"use client";

import { Button } from "@gitdojo/ui";
import { LoaderCircle, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { browserNavigation, useAuthClient } from "../services/auth-client";
import { consumeSignOutIntent } from "../services/sign-out-intent";
import { forgetSignedIn } from "../state/use-account-session";
import { AuthLink, AuthLinks } from "./AuthShell";

/** Where to go when the provider did not redirect (e.g. it could not be reached). */
const SIGNED_OUT = "/auth/signed-out";

/**
 * Ends the account session. Runs straight away when the learner chose "Sign out" in the account
 * menu; otherwise asks first. Local progress and playground repositories are not touched.
 */
export function SignOutRunner() {
  const { signOut } = useAuthClient();
  const [running, setRunning] = useState(false);
  const started = useRef(false);

  const run = async () => {
    if (started.current || !signOut) return;
    started.current = true;
    setRunning(true);
    forgetSignedIn();
    let redirected = false;
    try {
      // Clears the session cookie on the server, then leaves for the provider's sign-out page.
      const result: unknown = await signOut();
      redirected =
        typeof result === "object" &&
        result !== null &&
        (result as { redirected?: unknown }).redirected === true;
    } catch {
      // The SDK clears the local session even when the provider cannot be reached.
    }
    // A full page load on purpose: every header must re-read the (now signed-out) session.
    if (!redirected) browserNavigation.assign(SIGNED_OUT);
  };

  useEffect(() => {
    if (consumeSignOutIntent()) void run();
    // `run` is stable for this purpose: it only ever runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (running) {
    return (
      <p
        role="status"
        data-testid="signing-out"
        className="flex items-center gap-2 text-small text-fg-secondary"
      >
        <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden="true" />
        Signing you out…
      </p>
    );
  }

  return (
    <div data-testid="sign-out-confirm">
      <Button variant="primary" size="lg" className="w-full" onClick={() => void run()}>
        <LogOut aria-hidden="true" /> Sign out
      </Button>
      <AuthLinks>
        <AuthLink href="/account">Stay signed in</AuthLink>
      </AuthLinks>
    </div>
  );
}
