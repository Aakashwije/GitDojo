// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  attachRateLimitCookie,
  clientNetwork,
  rateLimitedResponse,
  SensitiveRequestRateLimiter,
} from "./rate-limit";

const CLIENT = "0123456789abcdef0123456789abcdef";
const env = {
  GITDOJO_RATE_LIMIT_AUTH_MAX: "2",
  GITDOJO_RATE_LIMIT_SESSION_MAX: "2",
  GITDOJO_RATE_LIMIT_PROGRESS_MAX: "2",
  GITDOJO_RATE_LIMIT_NETWORK_MULTIPLIER: "2",
  GITDOJO_RATE_LIMIT_WINDOW_SECONDS: "10",
};

function request(path: string, client = CLIENT, address = "203.0.113.42"): NextRequest {
  return new NextRequest(`https://gitdojo.dev${path}`, {
    headers: {
      cookie: `gitdojo_rate_limit=${client}`,
      "x-forwarded-for": `198.51.100.9, ${address}`,
    },
  });
}

function requestWith(
  path: string,
  init: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  return new NextRequest(`https://gitdojo.dev${path}`, init);
}

describe("sensitive request rate limiter", () => {
  it.each(["/sign-in", "/sign-up", "/api/auth/session", "/api/progress/lessons"])(
    "allows requests through the configured limit, then refuses %s",
    (path) => {
      const limiter = new SensitiveRequestRateLimiter(() => 1_000);
      expect(limiter.check(request(path), env).retryAfterSeconds).toBeNull();
      expect(limiter.check(request(path), env).retryAfterSeconds).toBeNull();
      expect(limiter.check(request(path), env).retryAfterSeconds).toBe(10);
    },
  );

  it("resets a bucket after its configured window", () => {
    let now = 1_000;
    const limiter = new SensitiveRequestRateLimiter(() => now);
    limiter.check(request("/sign-in"), env);
    limiter.check(request("/sign-in"), env);
    expect(limiter.check(request("/sign-in"), env).retryAfterSeconds).toBe(10);
    now += 10_000;
    expect(limiter.check(request("/sign-in"), env).retryAfterSeconds).toBeNull();
  });

  it("gives clients on one network separate buckets but retains a higher network ceiling", () => {
    const limiter = new SensitiveRequestRateLimiter(() => 1_000);
    for (let index = 0; index < 4; index += 1) {
      const client = index.toString(16).padStart(32, "0");
      expect(limiter.check(request("/api/auth/session", client), env).retryAfterSeconds).toBeNull();
    }
    expect(limiter.check(request("/api/auth/session", "f".repeat(32)), env).retryAfterSeconds).toBe(
      10,
    );
    expect(
      limiter.check(request("/api/auth/session", "f".repeat(32), "203.0.114.42"), env)
        .retryAfterSeconds,
    ).toBeNull();
  });

  it("uses the trusted end of a forwarded chain and groups IPv4 /24 and IPv6 /64 networks", () => {
    expect(clientNetwork(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.42" }))).toBe(
      "203.0.113",
    );
    expect(clientNetwork(new Headers({ "x-real-ip": "2001:db8:abcd:12::99" }))).toBe(
      "2001:0db8:abcd:0012",
    );
  });

  it("does not rate limit unrelated routes", () => {
    const limiter = new SensitiveRequestRateLimiter(() => 1_000);
    for (let count = 0; count < 10; count += 1) {
      expect(limiter.check(request("/learn"), env)).toEqual({
        clientId: null,
        retryAfterSeconds: null,
      });
    }
  });

  it.each([
    ["next-router-prefetch", "1"],
    ["purpose", "prefetch"],
    ["sec-purpose", "prefetch"],
  ])("does not charge Next.js prefetch traffic with the %s header", (header, value) => {
    const limiter = new SensitiveRequestRateLimiter(() => 1_000);
    const prefetched = request("/sign-in");
    prefetched.headers.set(header, value);

    for (let count = 0; count < 10; count += 1) {
      expect(limiter.check(prefetched, env)).toEqual({
        clientId: null,
        retryAfterSeconds: null,
      });
    }
    expect(limiter.check(request("/sign-in"), env).retryAfterSeconds).toBeNull();
  });

  it("still charges API requests and sign-in submissions carrying a prefetch header", () => {
    const limiter = new SensitiveRequestRateLimiter(() => 1_000);
    const headers = {
      cookie: `gitdojo_rate_limit=${CLIENT}`,
      "next-router-prefetch": "1",
      "x-forwarded-for": "203.0.113.42",
    };

    expect(limiter.check(requestWith("/api/auth/session", { headers }), env).clientId).toBe(CLIENT);
    expect(limiter.check(requestWith("/sign-in", { method: "POST", headers }), env).clientId).toBe(
      CLIENT,
    );
  });

  it("returns the same uncached 429 response and sets a private client cookie", async () => {
    const response = attachRateLimitCookie(
      rateLimitedResponse(7),
      new NextRequest("https://gitdojo.dev/sign-in"),
      "a".repeat(32),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain(
      "gitdojo_rate_limit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: "Too many requests. Try again shortly." },
    });
  });
});
