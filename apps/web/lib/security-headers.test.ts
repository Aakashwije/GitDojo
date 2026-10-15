import { createContentSecurityPolicy, createSecurityHeaders } from "./security-headers";

const headers = new Map(createSecurityHeaders().map(({ key, value }) => [key, value]));

describe("security headers", () => {
  it("keeps the required response protections enabled", () => {
    expect(Object.fromEntries(headers)).toEqual({
      "Content-Security-Policy": createContentSecurityPolicy(),
      "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
  });

  it("uses a restrictive production CSP with only the app's documented exceptions", () => {
    const directives = Object.fromEntries<string[]>(
      createContentSecurityPolicy()
        .split(";")
        .map((directive) => directive.trim())
        .filter(Boolean)
        .map((directive) => {
          const [name = "", ...sources] = directive.split(" ");
          return [name, sources] as const;
        }),
    );

    expect(directives).toEqual({
      "base-uri": ["'self'"],
      "connect-src": ["'self'"],
      "default-src": ["'self'"],
      "font-src": ["'self'", "data:"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "frame-src": ["'none'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "manifest-src": ["'self'"],
      "media-src": ["'self'"],
      "object-src": ["'none'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "upgrade-insecure-requests": [],
      "worker-src": ["'self'", "blob:"],
    });
  });

  it("allows unsafe-eval only for the Next.js development debugger", () => {
    expect(createContentSecurityPolicy(true)).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
    );
    expect(createContentSecurityPolicy(true)).not.toContain("upgrade-insecure-requests");
  });
});
