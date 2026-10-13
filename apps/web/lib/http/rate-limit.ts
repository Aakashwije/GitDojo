import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";

type RateLimitScope = "auth" | "progress" | "session";
type Env = Record<string, string | undefined>;

interface WindowCounter {
  count: number;
  resetAt: number;
}

interface ScopeLimit {
  clientMax: number;
  networkMax: number;
  windowMs: number;
}

export interface RateLimitCheck {
  clientId: string | null;
  retryAfterSeconds: number | null;
}

const CLIENT_COOKIE = "gitdojo_rate_limit";
const CLIENT_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_COUNTERS = 10_000;

const DEFAULTS: Record<RateLimitScope, number> = {
  auth: 20,
  progress: 180,
  session: 120,
};

function integer(value: string | undefined, fallback: number, maximum: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

function scopeFor(pathname: string): RateLimitScope | null {
  if (pathname === "/sign-in" || pathname === "/sign-up") return "auth";
  if (pathname === "/api/auth/session") return "session";
  if (pathname === "/api/progress" || pathname.startsWith("/api/progress/")) return "progress";
  return null;
}

function limitFor(scope: RateLimitScope, env: Env): ScopeLimit {
  const windowSeconds = integer(env.GITDOJO_RATE_LIMIT_WINDOW_SECONDS, 60, 3_600);
  const clientMax = integer(
    env[`GITDOJO_RATE_LIMIT_${scope.toUpperCase()}_MAX`],
    DEFAULTS[scope],
    100_000,
  );
  const networkMultiplier = integer(env.GITDOJO_RATE_LIMIT_NETWORK_MULTIPLIER, 25, 1_000);
  return { clientMax, networkMax: clientMax * networkMultiplier, windowMs: windowSeconds * 1_000 };
}

function ipv6Prefix(address: string): string {
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left = "", right = ""] = canonical.split("::");
  const leftParts = left === "" ? [] : left.split(":");
  const rightParts = right === "" ? [] : right.split(":");
  const groups = [
    ...leftParts,
    ...Array.from({ length: Math.max(0, 8 - leftParts.length - rightParts.length) }, () => "0"),
    ...rightParts,
  ];
  return groups
    .slice(0, 4)
    .map((group) => group.padStart(4, "0"))
    .join(":");
}

/**
 * Uses the address supplied by the trusted deployment proxy. The last x-forwarded-for entry is
 * the one appended nearest to GitDojo, so user-prepended values do not become the key.
 */
export function clientNetwork(headers: Headers): string {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-forwarded-for")?.split(",").at(-1),
    headers.get("x-real-ip"),
  ];
  for (const candidate of candidates) {
    const address = candidate?.trim() ?? "";
    const version = isIP(address);
    if (version === 4) return address.split(".").slice(0, 3).join(".");
    if (version === 6) return ipv6Prefix(address);
  }
  return "unknown";
}

class FixedWindowCounters {
  private readonly counters = new Map<string, WindowCounter>();

  take(key: string, maximum: number, windowMs: number, now: number): number | null {
    let counter = this.counters.get(key);
    if (!counter || counter.resetAt <= now) {
      if (this.counters.size >= MAX_COUNTERS) this.prune(now);
      counter = { count: 0, resetAt: now + windowMs };
      this.counters.set(key, counter);
    }
    if (counter.count >= maximum) {
      return Math.max(1, Math.ceil((counter.resetAt - now) / 1_000));
    }
    counter.count += 1;
    return null;
  }

  private prune(now: number): void {
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
    if (this.counters.size < MAX_COUNTERS) return;
    const oldest = this.counters.keys().next().value;
    if (oldest) this.counters.delete(oldest);
  }
}

export class SensitiveRequestRateLimiter {
  private readonly counters = new FixedWindowCounters();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly createClientId: () => string = () => crypto.randomUUID().replaceAll("-", ""),
  ) {}

  check(request: NextRequest, env: Env = process.env): RateLimitCheck {
    const scope = scopeFor(request.nextUrl.pathname);
    if (!scope) return { clientId: null, retryAfterSeconds: null };

    const network = clientNetwork(request.headers);
    const supplied = request.cookies.get(CLIENT_COOKIE)?.value ?? "";
    const clientId = CLIENT_ID_PATTERN.test(supplied) ? supplied : this.createClientId();
    const limit = limitFor(scope, env);
    const now = this.now();
    const clientRetry = this.counters.take(
      `${scope}:client:${network}:${clientId}`,
      limit.clientMax,
      limit.windowMs,
      now,
    );
    if (clientRetry !== null) return { clientId, retryAfterSeconds: clientRetry };

    const networkRetry = this.counters.take(
      `${scope}:network:${network}`,
      limit.networkMax,
      limit.windowMs,
      now,
    );
    return { clientId, retryAfterSeconds: networkRetry };
  }
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: "Too many requests. Try again shortly.",
      },
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export function attachRateLimitCookie(
  response: Response,
  request: NextRequest,
  clientId: string | null,
): Response {
  if (!clientId || request.cookies.get(CLIENT_COOKIE)?.value === clientId) return response;
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${CLIENT_COOKIE}=${clientId}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${
      request.nextUrl.protocol === "https:" ? "; Secure" : ""
    }`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
