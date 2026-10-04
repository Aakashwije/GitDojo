/**
 * Account configuration, read from the environment at request time. Only presence is checked
 * for secrets; their values are never returned, logged or sent to the browser.
 */

type Env = Record<string, string | undefined>;

export interface AuthConfig {
  /** Every required variable is set, so sign-in can be offered. */
  configured: boolean;
  /** Names (never values) of the variables that are missing or invalid. */
  missing: string[];
  /** The organization's base URL, e.g. `https://api.asgardeo.io/t/gitdojo`. */
  baseUrl: string | null;
  /** Whether "Create account" is offered; see `GITDOJO_SELF_REGISTRATION`. */
  selfRegistration: boolean;
}

/** The variables the identity provider integration needs. */
export const REQUIRED_AUTH_ENV = [
  "NEXT_PUBLIC_ASGARDEO_BASE_URL",
  "NEXT_PUBLIC_ASGARDEO_CLIENT_ID",
  "ASGARDEO_CLIENT_SECRET",
] as const;

/** Signs the session cookie. Required in production; development falls back to a fixed key. */
export const SESSION_SECRET_ENV = "ASGARDEO_SECRET";

function isValidBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local);
  } catch {
    return false;
  }
}

// Read through a variable so values are looked up at runtime instead of inlined at build time.
const runtimeEnv: Env = process.env;

export function readAuthConfig(env: Env = runtimeEnv): AuthConfig {
  const value = (name: string) => env[name]?.trim() ?? "";
  const missing: string[] = REQUIRED_AUTH_ENV.filter((name) => value(name) === "");
  const baseUrl = value("NEXT_PUBLIC_ASGARDEO_BASE_URL");
  if (baseUrl !== "" && !isValidBaseUrl(baseUrl)) missing.push("NEXT_PUBLIC_ASGARDEO_BASE_URL");
  if (env.NODE_ENV === "production" && value(SESSION_SECRET_ENV).length < 32) {
    missing.push(SESSION_SECRET_ENV);
  }
  return {
    configured: missing.length === 0,
    missing,
    baseUrl: missing.includes("NEXT_PUBLIC_ASGARDEO_BASE_URL") ? null : baseUrl.replace(/\/+$/, ""),
    selfRegistration: value("GITDOJO_SELF_REGISTRATION").toLowerCase() !== "disabled",
  };
}

/** Where WSO2 sends the learner back after signing in (an authorized redirect URL). */
export const SIGN_IN_CALLBACK_PATH = "/auth/callback";
/** Where WSO2 sends the learner after signing out (also an authorized redirect URL). */
export const SIGNED_OUT_PATH = "/auth/signed-out";

/**
 * Options for the identity provider SDK. Every caller must use these: the SDK client is
 * configured once per server process, by whichever code initializes it first.
 */
export const AUTH_PROVIDER_OPTIONS = {
  afterSignInUrl: SIGN_IN_CALLBACK_PATH,
  afterSignOutUrl: SIGNED_OUT_PATH,
  // Identity only: who the learner is. No repository or other API permissions.
  scopes: ["openid", "profile", "email"],
  preferences: {
    // GitDojo reads the profile itself from the standard OIDC userinfo endpoint.
    user: { fetchUserProfile: false, fetchOrganizations: false },
    // GitDojo's own design system; hosted pages are branded in the WSO2 console instead.
    theme: { inheritFromBranding: false },
  },
};
