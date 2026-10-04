/** Where a learner goes after signing in when no valid destination was given. */
export const DEFAULT_RETURN_PATH = "/learn";

/** Cookie holding the validated destination while the learner is on the sign-in pages. */
export const RETURN_PATH_COOKIE = "gitdojo_return_to";

/** Pages that are part of signing in or out: returning to them would loop. */
const AUTH_PATHS = ["/sign-in", "/sign-up", "/auth"];

// Any origin works: only same-origin results are accepted, and only the path is kept.
const BASE = "https://gitdojo.invalid";

/**
 * Turns an untrusted "where to go next" value into a safe same-origin path, or the fallback.
 *
 * Accepted: a relative path starting with a single `/` (with optional query and fragment).
 * Rejected: absolute URLs (`https://evil.example`), protocol-relative URLs (`//evil.example`),
 * backslash tricks (`/\evil.example`), other schemes (`javascript:`), control characters,
 * very long values and the sign-in pages themselves.
 */
export function safeReturnPath(value: unknown, fallback: string = DEFAULT_RETURN_PATH): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Browsers treat `\` like `/`, so `/\evil.example` would become protocol-relative.
  if (value.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  const isAuthPage = AUTH_PATHS.some(
    (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
  );
  if (isAuthPage) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/sign-in?returnTo=...` style links that carry the destination along. */
export function withReturnPath(path: string, returnTo: string | null | undefined): string {
  if (!returnTo) return path;
  const safe = safeReturnPath(returnTo, "");
  return safe === "" ? path : `${path}?returnTo=${encodeURIComponent(safe)}`;
}
