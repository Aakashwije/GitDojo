import { describe, expect, it } from "vitest";
import { readAuthConfig } from "./config";
import { DEFAULT_RETURN_PATH, safeReturnPath, withReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it.each([
    ["/learn/git-basics/git-init", "/learn/git-basics/git-init"],
    ["/challenges?difficulty=beginner#top", "/challenges?difficulty=beginner#top"],
    ["/", "/"],
    ["/dashboard/../learn", "/learn"],
    ["/account", "/account"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    ["an absolute URL", "https://evil.example/phish"],
    ["a protocol-relative URL", "//evil.example/phish"],
    ["a backslash trick", "/\\evil.example"],
    ["an encoded backslash", "\\\\evil.example"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,hi"],
    ["a relative path without a slash", "learn"],
    ["a control character", "/learn\n/evil"],
    ["a tab", "/\t/evil.example"],
    ["an empty string", ""],
    ["a very long path", `/${"a".repeat(600)}`],
    ["the sign-in page (would loop)", "/sign-in?returnTo=/learn"],
    ["the sign-up page", "/sign-up"],
    ["the auth callback", "/auth/callback?code=x"],
    ["a non-string", 42],
    ["undefined", undefined],
  ])("rejects %s", (_name, input) => {
    expect(safeReturnPath(input)).toBe(DEFAULT_RETURN_PATH);
  });

  it("uses the given fallback", () => {
    expect(safeReturnPath("//evil.example", "/")).toBe("/");
  });

  it("builds links that carry a safe destination only", () => {
    expect(withReturnPath("/sign-in", "/learn/merging")).toBe(
      "/sign-in?returnTo=%2Flearn%2Fmerging",
    );
    expect(withReturnPath("/sign-in", "https://evil.example")).toBe("/sign-in");
    expect(withReturnPath("/sign-in", null)).toBe("/sign-in");
  });
});

describe("readAuthConfig", () => {
  const complete = {
    NEXT_PUBLIC_ASGARDEO_BASE_URL: "https://api.asgardeo.io/t/gitdojo/",
    NEXT_PUBLIC_ASGARDEO_CLIENT_ID: "client-id",
    ASGARDEO_CLIENT_SECRET: "super-secret-value",
  };

  it("is unconfigured without credentials, naming what is missing", () => {
    expect(readAuthConfig({})).toEqual({
      configured: false,
      missing: [
        "NEXT_PUBLIC_ASGARDEO_BASE_URL",
        "NEXT_PUBLIC_ASGARDEO_CLIENT_ID",
        "ASGARDEO_CLIENT_SECRET",
      ],
      baseUrl: null,
      selfRegistration: true,
    });
    expect(readAuthConfig({ ...complete, ASGARDEO_CLIENT_SECRET: "  " }).configured).toBe(false);
  });

  it("is configured with all three values in development", () => {
    expect(readAuthConfig({ ...complete, NODE_ENV: "development" })).toMatchObject({
      configured: true,
      baseUrl: "https://api.asgardeo.io/t/gitdojo",
    });
  });

  it("requires a strong session secret in production", () => {
    const production = { ...complete, NODE_ENV: "production" };
    expect(readAuthConfig(production).missing).toEqual(["ASGARDEO_SECRET"]);
    expect(readAuthConfig({ ...production, ASGARDEO_SECRET: "short" }).configured).toBe(false);
    expect(readAuthConfig({ ...production, ASGARDEO_SECRET: "x".repeat(44) }).configured).toBe(
      true,
    );
  });

  it("rejects base URLs that are not https (except localhost)", () => {
    expect(
      readAuthConfig({ ...complete, NEXT_PUBLIC_ASGARDEO_BASE_URL: "http://idp.example" }),
    ).toMatchObject({ configured: false, missing: ["NEXT_PUBLIC_ASGARDEO_BASE_URL"] });
    expect(
      readAuthConfig({ ...complete, NEXT_PUBLIC_ASGARDEO_BASE_URL: "http://localhost:9443/t/x" })
        .configured,
    ).toBe(true);
  });

  it("can mark self-registration as closed", () => {
    expect(readAuthConfig({ ...complete, GITDOJO_SELF_REGISTRATION: "disabled" })).toMatchObject({
      selfRegistration: false,
    });
  });

  it("never exposes secret values", () => {
    const json = JSON.stringify(
      readAuthConfig({
        ...complete,
        ASGARDEO_SECRET: "session-secret-value",
        NODE_ENV: "production",
      }),
    );
    expect(json).not.toContain("super-secret-value");
    expect(json).not.toContain("session-secret-value");
  });
});
