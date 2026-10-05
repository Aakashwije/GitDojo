import "server-only";

import { readAuthConfig } from "./config";
import { defaultSessionDeps, forgetProfile, type SessionDeps } from "./session";

const USERINFO_TIMEOUT_MS = 5000;

/** Who the learner is, as verified by the identity provider. Server-side only. */
export interface VerifiedIdentity {
  /**
   * The identity provider: the organization's OIDC issuer (`{baseUrl}/oauth2/token`). Subjects are
   * unique per issuer only, so two organizations can never share an account.
   */
  issuer: string;
  /** The provider's stable OIDC `sub` for this learner. Opaque and case-sensitive. */
  subject: string;
  /** Profile details for display. Never used to identify or authorize anyone. */
  name: string | null;
  email: string | null;
}

export type IdentityResult =
  | { status: "verified"; identity: VerifiedIdentity }
  /** No session, an ended or revoked one, or no usable subject: treat as signed out. */
  | { status: "unauthenticated" }
  /** The provider could not confirm the session right now. Access is denied all the same. */
  | { status: "unavailable" };

const MAX_SUBJECT_LENGTH = 255;
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function validSubject(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value.length <= MAX_SUBJECT_LENGTH &&
    value.trim() === value &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function profileText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" || text.length > max ? null : text;
}

/** The issuer WSO2 Identity Platform uses for an organization's base URL. */
export function issuerFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/oauth2/token`;
}

/**
 * Verifies the learner's session for an authorization decision. The session cookie is checked
 * by the SDK (signature and expiry; refreshed by `proxy.ts`), then the provider's userinfo
 * endpoint is asked who the session's access token belongs to: its `sub` is the identity. The
 * subject is never taken from the browser or from an email address, and is not cached, so a
 * revoked session stops working immediately. Never throws and never logs tokens.
 */
export async function getVerifiedIdentity(deps?: SessionDeps): Promise<IdentityResult> {
  const config = deps?.config ?? readAuthConfig();
  if (!config.configured || config.baseUrl === null) return { status: "unauthenticated" };

  let resolved: SessionDeps;
  let sessionId: string | undefined;
  let accessToken: string;
  try {
    resolved = deps ?? (await defaultSessionDeps());
    sessionId = await resolved.getSessionId();
    if (!sessionId) return { status: "unauthenticated" };
    // Throws when the verified session holds no access token.
    accessToken = await resolved.getAccessToken(sessionId);
  } catch {
    return { status: "unauthenticated" };
  }
  if (typeof accessToken !== "string" || accessToken === "") return { status: "unauthenticated" };

  try {
    const response = await resolved.fetch(`${config.baseUrl}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      // A slow provider must not hold the request open until the platform times it out.
      signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
    });
    // The provider no longer accepts the token: the session has ended.
    if (response.status === 401 || response.status === 403) {
      forgetProfile(sessionId);
      return { status: "unauthenticated" };
    }
    if (!response.ok) return { status: "unavailable" };

    const claims: unknown = await response.json();
    if (typeof claims !== "object" || claims === null) return { status: "unavailable" };
    const { sub, name, given_name, family_name, email } = claims as Record<string, unknown>;
    if (!validSubject(sub)) {
      console.warn("[gitdojo] the identity provider returned no usable subject");
      return { status: "unauthenticated" };
    }
    const fullName =
      profileText(name, 200) ??
      profileText(
        [profileText(given_name, 100), profileText(family_name, 100)].filter(Boolean).join(" "),
        200,
      );
    return {
      status: "verified",
      identity: {
        issuer: issuerFor(config.baseUrl),
        subject: sub,
        name: fullName,
        email: profileText(email, 320),
      },
    };
  } catch (error) {
    console.warn(
      "[gitdojo] could not verify the account session:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { status: "unavailable" };
  }
}
