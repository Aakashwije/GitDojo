import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AuthConfig } from "./config";
import { clearProfileCache, getAccountSession, toAccountUser, type SessionDeps } from "./session";

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

function deps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  return {
    config: CONFIG,
    getSessionId: vi.fn(() => Promise.resolve("session-1")),
    getAccessToken: vi.fn(() => Promise.resolve(TOKEN)),
    fetch: vi.fn(() =>
      Promise.resolve(
        Response.json({ given_name: "Ada", family_name: "Lovelace", email: "ada@example.com" }),
      ),
    ),
    ...overrides,
  };
}

beforeEach(() => {
  clearProfileCache();
});

describe("getAccountSession", () => {
  it("reports unconfigured without touching the SDK", async () => {
    const d = deps({ config: { ...CONFIG, configured: false, baseUrl: null } });
    expect(await getAccountSession(d)).toEqual({ status: "unconfigured" });
    expect(d.getSessionId).not.toHaveBeenCalled();
  });

  it("is signed out without a valid session cookie", async () => {
    const d = deps({ getSessionId: () => Promise.resolve(undefined) });
    expect(await getAccountSession(d)).toEqual({ status: "signed-out" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("reads the profile from the OIDC userinfo endpoint with the session's token", async () => {
    const d = deps();
    expect(await getAccountSession(d)).toEqual({
      status: "signed-in",
      user: { name: "Ada Lovelace", email: "ada@example.com", picture: null },
    });
    const [url, init] = vi.mocked(d.fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://api.asgardeo.io/t/gitdojo/oauth2/userinfo");
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it("caches the profile per session", async () => {
    const d = deps();
    await getAccountSession(d);
    await getAccountSession(d);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a rejected token as an ended session", async () => {
    const d = deps({ fetch: () => Promise.resolve(new Response(null, { status: 401 })) });
    expect(await getAccountSession(d)).toEqual({ status: "signed-out" });
  });

  it("stays signed in with a generic name when the profile cannot be read", async () => {
    const d = deps({ fetch: () => Promise.resolve(new Response(null, { status: 503 })) });
    expect(await getAccountSession(d)).toMatchObject({
      status: "signed-in",
      user: { name: "Your account" },
    });
  });

  it("fails closed and never logs tokens", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const d = deps({
      getAccessToken: () => Promise.reject(new Error(`token ${TOKEN} could not be refreshed`)),
    });
    expect(await getAccountSession(d)).toEqual({ status: "signed-out" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
    warn.mockRestore();
  });
});

describe("toAccountUser", () => {
  it("prefers the full name, then usernames, then the email", () => {
    expect(toAccountUser({ name: "Grace Hopper" }).name).toBe("Grace Hopper");
    expect(toAccountUser({ preferred_username: "grace" }).name).toBe("grace");
    expect(toAccountUser({ email: "linus@example.com" }).name).toBe("linus");
    expect(toAccountUser({}).name).toBe("Your account");
  });

  it("only keeps https avatars", () => {
    expect(toAccountUser({ picture: "https://cdn.example/a.png" }).picture).toBe(
      "https://cdn.example/a.png",
    );
    expect(toAccountUser({ picture: "javascript:alert(1)" }).picture).toBeNull();
    expect(toAccountUser({ picture: "http://cdn.example/a.png" }).picture).toBeNull();
  });
});
