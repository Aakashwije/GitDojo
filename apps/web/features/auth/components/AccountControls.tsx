"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@gitdojo/ui";
import { ChevronDown, LayoutDashboard, LogIn, LogOut, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { withReturnPath } from "@/lib/auth/return-path";
import { markSignOutIntent } from "../services/sign-out-intent";
import { loadAccountSession, useAccountSession } from "../state/use-account-session";
import { type AccountUser } from "../types";
import { AccountAvatar } from "./AccountAvatar";

const noSubscription = () => () => undefined;

/** The page the learner is on, to come back to after signing in (`null` on the server). */
function useCurrentPath(): string | null {
  // Re-read on every render: client navigations re-render the header with the new location.
  return useSyncExternalStore(
    noSubscription,
    () => `${window.location.pathname}${window.location.search}`,
    () => null,
  );
}

export interface AccountControlsProps {
  /** Workspace headers have less room: avatar only, and just "Sign in" when signed out. */
  compact?: boolean;
  className?: string;
}

/**
 * Sign in / Create account when signed out, the account menu when signed in, nothing when
 * accounts are not set up. The same control appears on every page with a header.
 */
export function AccountControls({ compact = false, className }: AccountControlsProps) {
  const session = useAccountSession((state) => state.session);
  const returnTo = useCurrentPath();

  useEffect(() => {
    void loadAccountSession();
  }, []);

  if (session === null) {
    // Reserve the space so the header does not jump when the state arrives.
    return (
      <span
        aria-hidden="true"
        data-testid="account-loading"
        className={cn("h-8 animate-pulse rounded-md bg-panel", compact ? "w-8" : "w-24", className)}
      />
    );
  }
  if (session.status === "unconfigured") return null;

  if (session.status === "signed-out") {
    return (
      <div className={cn("flex items-center gap-2", className)} data-testid="account-signed-out">
        <SessionExpiredNotice returnTo={returnTo} />
        {compact ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={withReturnPath("/sign-in", returnTo)} aria-label="Sign in">
              <LogIn /> <span className="max-sm:sr-only">Sign in</span>
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={withReturnPath("/sign-in", returnTo)}>Sign in</Link>
            </Button>
            <Button asChild variant="primary" size="sm" className="max-sm:hidden">
              <Link href={withReturnPath("/sign-up", returnTo)}>Create account</Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return <AccountMenu user={session.user} compact={compact} className={className} />;
}

function AccountMenu({
  user,
  compact,
  className,
}: {
  user: AccountUser;
  compact: boolean;
  className?: string | undefined;
}) {
  const router = useRouter();
  return (
    // Non-modal, the WAI-ARIA menu button pattern: the page is not hidden from assistive tech,
    // arrows and Esc work inside the menu, and Tab moves on (closing it).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="account-menu"
          aria-label={`Account menu for ${user.name}`}
          className={cn(
            "flex h-9 min-w-9 items-center gap-2 rounded-md px-1 text-small text-fg-secondary transition-colors outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)] data-[state=open]:bg-hover",
            !compact && "sm:pr-2",
            className,
          )}
        >
          <AccountAvatar user={user} />
          {compact ? null : (
            <>
              <span className="max-w-32 truncate max-sm:hidden" data-testid="account-name">
                {user.name}
              </span>
              <ChevronDown className="size-4 max-sm:hidden" aria-hidden="true" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="flex items-center gap-3">
          <AccountAvatar user={user} />
          <span className="min-w-0">
            <span className="block truncate text-small font-medium text-fg">{user.name}</span>
            {user.email ? (
              <span className="block truncate text-caption text-fg-muted">{user.email}</span>
            ) : null}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound aria-hidden="true" /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard aria-hidden="true" /> Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="sign-out"
          onSelect={() => {
            markSignOutIntent();
            router.push("/auth/sign-out");
          }}
        >
          <LogOut aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shown once when a session ended on its own (expired or revoked), not after signing out. */
function SessionExpiredNotice({ returnTo }: { returnTo: string | null }) {
  const expired = useAccountSession((state) => state.expired);
  const dismiss = useAccountSession((state) => state.dismissExpired);
  // Rendered into <body>: the header's backdrop blur would otherwise trap `position: fixed`.
  if (!expired || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      data-testid="session-expired"
      className="fixed bottom-4 left-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-border-strong bg-elevated p-3 shadow-xl shadow-black/40 max-md:right-4 max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))]"
    >
      <p className="text-small text-fg-secondary">
        <span className="font-medium text-fg">Your session has ended. </span>
        Your learning progress is still here.{" "}
        <Link
          href={withReturnPath("/sign-in", returnTo)}
          className="text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          Sign in again
        </Link>
      </p>
      <IconButton aria-label="Dismiss" className="-mt-1 -mr-1 shrink-0" onClick={dismiss}>
        <X />
      </IconButton>
    </div>,
    document.body,
  );
}
