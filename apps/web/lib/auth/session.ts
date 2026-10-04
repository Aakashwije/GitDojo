import "server-only";

import { asgardeo } from "@asgardeo/nextjs/server";
import { type AccountSession, type AccountUser } from "@/features/auth/types";
import { readAuthConfig, type AuthConfig } from "./config";

/** The SDK session boundary, injectable so tests stay deterministic. */
export interface SessionDeps {
  config: AuthConfig;
  /** The session id from the signed session cookie, verified (signature and expiry) by the SDK. */
  getSessionId: () => Promise<string | undefined>;
  getAccessToken: (sessionId: string) => Promise<string>;
  fetch: typeof fetch;
}

async function defaultDeps(): Promise<SessionDeps> {
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
 * The learner's account state, validated on the server through the SDK's session cookie.
 * Never throws: problems talking to the identity provider show as signed out, and are logged
 * without any token or response body.
 */
export async function getAccountSession(deps?: SessionDeps): Promise<AccountSession> {
  const config = deps?.config ?? readAuthConfig();
  if (!config.configured || config.baseUrl === null) return { status: "unconfigured" };

  try {
    const resolved = deps ?? (await defaultDeps());
    const sessionId = await resolved.getSessionId();
    if (!sessionId) return { status: "signed-out" };

    const cached = profiles.get(sessionId);
    if (cached && cached.expires > Date.now()) return { status: "signed-in", user: cached.user };

    const accessToken = await resolved.getAccessToken(sessionId);
    // The standard OIDC userinfo endpoint: needs only the openid/profile/email scopes.
    const response = await resolved.fetch(`${config.baseUrl}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    // A revoked or expired token: the session is no longer usable.
    if (response.status === 401 || response.status === 403) return { status: "signed-out" };
    const user = response.ok
      ? toAccountUser((await response.json()) as UserInfo)
      : toAccountUser({});

    if (profiles.size >= MAX_CACHED) {
      const oldest = profiles.keys().next().value;
      if (oldest !== undefined) profiles.delete(oldest);
    }
    if (response.ok) profiles.set(sessionId, { user, expires: Date.now() + PROFILE_TTL_MS });
    return { status: "signed-in", user };
  } catch (error) {
    console.warn(
      "[gitdojo] could not read the account session:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { status: "signed-out" };
  }
}
