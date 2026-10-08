import "server-only";

const USERINFO_TIMEOUT_MS = 5000;

export type UserInfoResult =
  | { status: "ok"; claims: unknown }
  /** 401 or 403: the provider no longer accepts the token, so the session has ended. */
  | { status: "rejected" }
  /** Any other unsuccessful response: the provider could not answer right now. */
  | { status: "failed" };

/**
 * The identity provider's standard OIDC userinfo endpoint: who an access token belongs to. It
 * needs only the openid/profile/email scopes. The one place GitDojo talks to it, for both the
 * navigation's profile (`session.ts`) and authorization decisions (`identity.ts`).
 *
 * Rejects on network errors, timeouts and unreadable bodies; callers turn those into their own
 * signed-out or unavailable state, and never log the token.
 */
export async function fetchUserInfo(
  fetchFn: typeof fetch,
  baseUrl: string,
  accessToken: string,
): Promise<UserInfoResult> {
  const response = await fetchFn(`${baseUrl}/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    // A slow provider must not hold the request open until the platform times it out.
    signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) return { status: "rejected" };
  if (!response.ok) return { status: "failed" };
  return { status: "ok", claims: (await response.json()) as unknown };
}
