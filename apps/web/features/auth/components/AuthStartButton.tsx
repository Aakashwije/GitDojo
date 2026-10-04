"use client";

import { Button } from "@gitdojo/ui";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rememberReturnPath } from "../actions";
import { useAuthClient } from "../services/auth-client";

type ButtonState = "idle" | "redirecting" | "error";

/** How long to wait for the browser to leave for the sign-in page before offering a retry. */
export const REDIRECT_TIMEOUT_MS = 15_000;

export interface AuthStartButtonProps {
  /** Visible label, e.g. "Sign in" or "Create account". */
  label: string;
  /** Where to come back to afterwards; validated again on the server. */
  returnTo: string;
  /** Test id for the button. */
  testId?: string;
}

/**
 * Hands over to the identity provider's hosted pages, where credentials are entered (and where
 * new learners register). GitDojo never sees a password.
 */
export function AuthStartButton({ label, returnTo, testId }: AuthStartButtonProps) {
  const { signIn, isLoading } = useAuthClient();
  const [state, setState] = useState<ButtonState>("idle");
  // A ref as well as state: a second click can arrive before React re-renders.
  const busy = useRef(false);

  useEffect(() => {
    // Coming back with the browser's Back button restores this page from cache mid-redirect.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      busy.current = false;
      setState("idle");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const start = async () => {
    if (busy.current || !signIn) return;
    busy.current = true;
    setState("redirecting");
    try {
      await rememberReturnPath(returnTo);
      // Navigates away to the hosted page; this tab stays "redirecting" until it does.
      await signIn();
      // Still here long after the redirect should have happened: let the learner retry.
      window.setTimeout(() => {
        if (document.visibilityState !== "visible" || !busy.current) return;
        busy.current = false;
        setState("error");
      }, REDIRECT_TIMEOUT_MS);
    } catch {
      busy.current = false;
      setState("error");
    }
  };

  const preparing = isLoading === true && state === "idle";
  const redirecting = state === "redirecting";

  return (
    <div>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        data-testid={testId}
        disabled={preparing || redirecting}
        aria-busy={redirecting || preparing}
        onClick={() => void start()}
      >
        {redirecting || preparing ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : null}
        {redirecting ? "Redirecting…" : preparing ? "Preparing…" : label}
        {redirecting || preparing ? null : <ArrowRight aria-hidden="true" />}
      </Button>
      <p role="status" className="sr-only">
        {redirecting ? "Redirecting to the secure sign-in page." : ""}
      </p>
      {state === "error" ? (
        <p
          role="alert"
          data-testid="auth-start-error"
          className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-small text-fg"
        >
          We couldn&apos;t reach the sign-in service. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
