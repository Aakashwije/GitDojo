/**
 * Whether a cookie-authenticated write comes from GitDojo's own pages. Browsers send `Origin` on
 * every cross-origin request and on same-origin POSTs, and `Sec-Fetch-Site` where supported; a
 * request must carry an `Origin` whose host is this server's (`X-Forwarded-Host` behind a proxy,
 * as Next.js checks for Server Actions), and must not be marked cross-site. Requests without an
 * `Origin` are refused, so non-browser clients must send one.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;

  const origin = headers.get("origin");
  if (origin === null || origin === "null") return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  return !!host && host.toLowerCase() === originHost.toLowerCase();
}
