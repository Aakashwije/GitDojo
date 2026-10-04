import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./same-origin";

const headers = (values: Record<string, string>) => new Headers(values);

describe("isSameOriginRequest", () => {
  it("accepts a request from the same host", () => {
    expect(
      isSameOriginRequest(
        headers({
          host: "gitdojo.dev",
          origin: "https://gitdojo.dev",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(headers({ host: "localhost:3000", origin: "http://localhost:3000" })),
    ).toBe(true);
  });

  it("uses the forwarded host behind a reverse proxy", () => {
    expect(
      isSameOriginRequest(
        headers({
          host: "internal:3000",
          "x-forwarded-host": "gitdojo.dev",
          origin: "https://gitdojo.dev",
        }),
      ),
    ).toBe(true);
  });

  it("rejects other origins, including look-alikes and other ports", () => {
    for (const origin of [
      "https://evil.example",
      "https://gitdojo.dev.evil.example",
      "https://gitdojo.dev:8443",
      "null",
      "not a url",
    ]) {
      expect(isSameOriginRequest(headers({ host: "gitdojo.dev", origin }))).toBe(false);
    }
  });

  it("rejects requests without an Origin", () => {
    expect(isSameOriginRequest(headers({ host: "gitdojo.dev" }))).toBe(false);
  });

  it("rejects requests the browser marks as cross-site or same-site", () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      expect(
        isSameOriginRequest(
          headers({ host: "gitdojo.dev", origin: "https://gitdojo.dev", "sec-fetch-site": site }),
        ),
      ).toBe(false);
    }
  });
});
