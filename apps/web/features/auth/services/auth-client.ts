"use client";

import { useAsgardeo } from "@asgardeo/nextjs";

/**
 * The parts of the identity provider SDK that GitDojo uses, behind one typed boundary: the
 * components never touch the SDK directly, and tests mock this module.
 */
export interface AuthClient {
  /** Starts hosted sign-in (where new learners can also register); navigates away. */
  signIn?: () => Promise<unknown>;
  /** Ends the session; usually navigates to the provider's sign-out page. */
  signOut?: () => Promise<unknown>;
  /** True until the SDK has resolved the session on this page. */
  isLoading?: boolean;
}

export function useAuthClient(): AuthClient {
  const { signIn, signOut, isLoading } = useAsgardeo() as AuthClient;
  return {
    ...(signIn ? { signIn: () => signIn() } : {}),
    ...(signOut ? { signOut: () => signOut() } : {}),
    isLoading: isLoading === true,
  };
}

/** Full page loads, e.g. after signing out. An object so tests can replace `assign`. */
export const browserNavigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};
