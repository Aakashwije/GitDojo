interface SecurityHeader {
  key: string;
  value: string;
}

const REQUIRED_PERMISSIONS = [
  "camera=()",
  "geolocation=()",
  "microphone=()",
  "payment=()",
  "usb=()",
];

/**
 * Builds the site-wide CSP. GitDojo keeps its scripts, fonts, APIs and Monaco assets on the same
 * origin. The deliberate compatibility exceptions are documented in docs/security.md.
 */
export function createContentSecurityPolicy(development = false): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob: https:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ];
  if (!development) directives.push("upgrade-insecure-requests");
  return `${directives.join("; ")};`;
}

/** Applied to every response by next.config.ts, including API and static asset responses. */
export function createSecurityHeaders(development = false): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: createContentSecurityPolicy(development) },
    { key: "Permissions-Policy", value: REQUIRED_PERMISSIONS.join(", ") },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
