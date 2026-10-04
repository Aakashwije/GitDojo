"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthLink, AuthLinks } from "./AuthShell";

/** How long finishing sign-in may take before the learner is offered a way out. */
export const CALLBACK_TIMEOUT_MS = 20_000;

/**
 * Shown while the sign-in is completed on the server (the SDK provider exchanges the code and
 * then navigates on). If that never finishes, offer a retry instead of spinning forever.
 */
export function CallbackProgress({ returnTo }: { returnTo: string }) {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStalled(true);
    }, CALLBACK_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  if (stalled) {
    return (
      <div data-testid="callback-stalled">
        <p role="alert" className="text-small text-fg-secondary">
          Signing in is taking longer than expected.
        </p>
        <AuthLinks>
          <AuthLink href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
            Try signing in again
          </AuthLink>
          <AuthLink href={returnTo}>Continue without an account</AuthLink>
        </AuthLinks>
      </div>
    );
  }

  return (
    <p
      role="status"
      data-testid="callback-progress"
      className="flex items-center gap-2 text-small text-fg-secondary"
    >
      <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden="true" />
      Finishing sign-in…
    </p>
  );
}
