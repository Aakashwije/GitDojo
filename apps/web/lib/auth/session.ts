import "server-only";

import { asgardeo } from "@asgardeo/nextjs/server";
import type { AccountSession, AccountUser } from "@/features/auth";
import { readAuthConfig, type AuthConfig } from "./config";
import { fetchUserInfo } from "./userinfo";

/**
 * The session port: the SDK boundary, injectable so tests stay deterministic. `defaultSessionDeps`
 * is the one adapter that binds it to `@asgardeo/nextjs`.
 */
export interface SessionDeps {
  config: AuthConfig;
  /** The session id from the signed session cookie, verified (signature and expiry) by the SDK. */
  getSessionId: () => Promise<string | undefined>;
  getAccessToken: (sessionId: string) => Promise<string>;
  fetch: typeof fetch;
}

export async function defaultSessionDeps(): Promise<SessionDeps> {
  const client = await asgardeo();
  return {
    config: readAuthConfig(),
    getSessionId: client.getSessionId,
    getAccessToken: client.getAccessToken,
    fetch,
  };
}

interface UserInfo {
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  preferred_username?: unknown;
  username?: unknown;
  email?: unknown;
  picture?: unknown;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** Maps standard OIDC claims to what the navigation shows. */
export function toAccountUser(claims: UserInfo): AccountUser {
  const email = text(claims.email);
  const fullName =
    text(claims.name) ??
    ([text(claims.given_name), text(claims.family_name)].filter(Boolean).join(" ") || null);
  const name =
    fullName ??
    text(claims.preferred_username) ??
    text(claims.username) ??
    email?.split("@")[0] ??
    "Your account";
  const picture = text(claims.picture);
  return {
    name,
    email,
    picture: picture?.startsWith("https://") ? picture : null,
  };
}

// Profiles change rarely; caching per session avoids a userinfo call on every page view.
const PROFILE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED = 500;
const profiles = new Map<string, { user: AccountUser; expires: number }>();

/** Forgets cached profiles, for tests. */
export function clearProfileCache(): void {
  profiles.clear();
}

/**
 * Forgets one session's cached profile, when the provider has rejected its token: the header and
 * sign-in pages then see the session as ended at once instead of after the cache expires.
 */
export function forgetProfile(sessionId: string): void {
  profiles.delete(sessionId);
}

/**
 * The learner's account state, validated on the server through the SDK's session cookie.
 * Never throws: problems talking to the identity provider show as signed out, and are logged
 * without any token or response body.
 */
export async function getAccountSession(
  deps?: SessionDeps,
  /** Ask the provider even if a profile is cached: for decisions such as skipping sign-in. */
  { fresh = false }: { fresh?: boolean } = {},
): Promise<AccountSession> {
  const config = deps?.config ?? readAuthConfig();
  if (!config.configured || config.baseUrl === null) return { status: "unconfigured" };

  try {
    const resolved = deps ?? (await defaultSessionDeps());
    const sessionId = await resolved.getSessionId();
    if (!sessionId) return { status: "signed-out" };

    const cached = profiles.get(sessionId);
    if (!fresh && cached && cached.expires > Date.now()) {
      return { status: "signed-in", user: cached.user };
    }

    const accessToken = await resolved.getAccessToken(sessionId);
    const userInfo = await fetchUserInfo(resolved.fetch, config.baseUrl, accessToken);
    // A revoked or expired token: the session is no longer usable.
    if (userInfo.status === "rejected") return { status: "signed-out" };
    const user = toAccountUser(userInfo.status === "ok" ? (userInfo.claims as UserInfo) : {});

    if (profiles.size >= MAX_CACHED) {
      const oldest = profiles.keys().next().value;
      if (oldest !== undefined) profiles.delete(oldest);
    }
    if (userInfo.status === "ok")
      profiles.set(sessionId, { user, expires: Date.now() + PROFILE_TTL_MS });
    return { status: "signed-in", user };
  } catch (error) {
    console.warn(
      "[gitdojo] could not read the account session:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { status: "signed-out" };
  }
}
