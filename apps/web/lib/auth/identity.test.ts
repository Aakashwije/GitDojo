import { describe, expect, it, vi } from "vitest";
import { type AuthConfig } from "./config";
import { getVerifiedIdentity, issuerFor } from "./identity";
import { clearProfileCache, getAccountSession, type SessionDeps } from "./session";

vi.mock("server-only", () => ({}));
// The SDK boundary is replaced by injected dependencies in every test.
vi.mock("@asgardeo/nextjs/server", () => ({ asgardeo: vi.fn() }));

const CONFIG: AuthConfig = {
  configured: true,
  missing: [],
  baseUrl: "https://api.asgardeo.io/t/gitdojo",
  selfRegistration: true,
};

const TOKEN = "access-token-that-must-never-be-logged";

function deps(claims: unknown = { sub: "user-123" }, overrides: Partial<SessionDeps> = {}) {
  return {
    config: CONFIG,
    getSessionId: vi.fn(() => Promise.resolve("session-1")),
    getAccessToken: vi.fn(() => Promise.resolve(TOKEN)),
    fetch: vi.fn(() => Promise.resolve(Response.json(claims))),
    ...overrides,
  } satisfies SessionDeps;
}

describe("getVerifiedIdentity", () => {
  it("takes the subject from the provider's userinfo endpoint, namespaced by issuer", async () => {
    const d = deps({ sub: "user-123", name: "Ada Lovelace", email: "ada@example.com" });
    expect(await getVerifiedIdentity(d)).toEqual({
      status: "verified",
      identity: {
        issuer: "https://api.asgardeo.io/t/gitdojo/oauth2/token",
        subject: "user-123",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    });
    const [url, init] = vi.mocked(d.fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://api.asgardeo.io/t/gitdojo/oauth2/userinfo");
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(init?.cache).toBe("no-store");
  });

  it("gives each organization its own issuer, so equal subjects never collide", () => {
    expect(issuerFor("https://api.asgardeo.io/t/one")).not.toBe(
      issuerFor("https://api.asgardeo.io/t/two"),
    );
  });

  it("is unauthenticated without configuration, without touching the SDK", async () => {
    const d = deps(undefined, { config: { ...CONFIG, configured: false, baseUrl: null } });
    expect(await getVerifiedIdentity(d)).toEqual({ status: "unauthenticated" });
    expect(d.getSessionId).not.toHaveBeenCalled();
  });

  it("is unauthenticated without a verified session cookie", async () => {
    const d = deps(undefined, { getSessionId: vi.fn(() => Promise.resolve(undefined)) });
    expect(await getVerifiedIdentity(d)).toEqual({ status: "unauthenticated" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("is unauthenticated when the session holds no access token", async () => {
    const d = deps(undefined, {
      getAccessToken: vi.fn(() => Promise.reject(new Error("Failed to get access token."))),
    });
    expect(await getVerifiedIdentity(d)).toEqual({ status: "unauthenticated" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("is unauthenticated when the provider rejects the token", async () => {
    for (const status of [401, 403]) {
      const d = deps(undefined, {
        fetch: vi.fn(() => Promise.resolve(new Response(null, { status }))),
      });
      expect(await getVerifiedIdentity(d)).toEqual({ status: "unauthenticated" });
    }
  });

  it.each([
    ["missing", { email: "ada@example.com" }],
    ["empty", { sub: "" }],
    ["a number", { sub: 42 }],
    ["padded with spaces", { sub: " user-123 " }],
    ["containing control characters", { sub: "user\u0000123" }],
    ["too long", { sub: "x".repeat(256) }],
  ])("never authorizes a subject that is %s", async (_label, claims) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await getVerifiedIdentity(deps(claims))).toEqual({ status: "unauthenticated" });
    warn.mockRestore();
  });

  it("never falls back to the email as the identity", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await getVerifiedIdentity(deps({ email: "ada@example.com" }));
    expect(result.status).toBe("unauthenticated");
    warn.mockRestore();
  });

  it("denies access when the provider cannot answer, and never logs tokens", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const outage = deps(undefined, {
      fetch: vi.fn(() => Promise.resolve(new Response("down", { status: 503 }))),
    });
    expect(await getVerifiedIdentity(outage)).toEqual({ status: "unavailable" });

    const network = deps(undefined, {
      fetch: vi.fn(() => Promise.reject(new TypeError(`fetch failed with ${TOKEN}`))),
    });
    expect(await getVerifiedIdentity(network)).toEqual({ status: "unavailable" });

    const garbage = deps(undefined, {
      fetch: vi.fn(() => Promise.resolve(new Response("not json"))),
    });
    expect(await getVerifiedIdentity(garbage)).toEqual({ status: "unavailable" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
    warn.mockRestore();
  });

  it("ends the header's cached session when the provider rejects the token", async () => {
    clearProfileCache();
    const signedIn = deps({ sub: "user-123", name: "Ada" });
    expect(await getAccountSession(signedIn)).toMatchObject({ status: "signed-in" });
    const rejected = deps(undefined, {
      fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))),
    });
    // Without this, the header would show "signed in" until its profile cache expired.
    expect(await getVerifiedIdentity(rejected)).toEqual({ status: "unauthenticated" });
    expect(await getAccountSession(rejected)).toEqual({ status: "signed-out" });
  });

  it("asks the provider on every call, so a revoked session stops working at once", async () => {
    const d = deps();
    await getVerifiedIdentity(d);
    await getVerifiedIdentity(d);
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps only usable profile details", async () => {
    const result = await getVerifiedIdentity(
      deps({ sub: "u", given_name: "Grace", family_name: "Hopper", email: 7 }),
    );
    expect(result).toMatchObject({ identity: { name: "Grace Hopper", email: null } });
  });
});
