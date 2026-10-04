"use server";

import { cookies } from "next/headers";
import { RETURN_PATH_COOKIE, safeReturnPath } from "@/lib/auth/return-path";

/**
 * Remembers where to go after signing in, validated on the server. Only same-origin relative
 * paths are stored, so the callback can never redirect off-site.
 */
export async function rememberReturnPath(path: string): Promise<void> {
  const store = await cookies();
  store.set(RETURN_PATH_COOKIE, safeReturnPath(path), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long enough to sign up and verify an email, short enough not to linger.
    maxAge: 30 * 60,
  });
}
