"use server";

import { cookies } from "next/headers";
import { RETURN_PATH_COOKIE, safeReturnPath } from "@/lib/auth/return-path";

/** The SDK's session cookie (`@asgardeo/node` CookieConfig; covered by e2e/account-progress). */
const SDK_SESSION_COOKIE = "__asgardeo__session";

/**
 * Runs as sign-in or sign-up starts. Remembers where to go afterwards, validated on the server:
 * only same-origin relative paths are stored, so the callback can never redirect off-site.
 *
 * Also drops any previous session. Sign-in is only offered when the provider no longer accepts
 * the session (the sign-in pages check with it), but a session the provider ended early can
 * still have a validly signed cookie, and the SDK would then never finish the new sign-in.
 */
export async function rememberReturnPath(path: string): Promise<void> {
  const store = await cookies();
  store.delete(SDK_SESSION_COOKIE);
  store.set(RETURN_PATH_COOKIE, safeReturnPath(path), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long enough to sign up and verify an email, short enough not to linger.
    maxAge: 30 * 60,
  });
}
