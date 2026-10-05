// @vitest-environment node
import { describe, expect, it } from "vitest";
import { connectionConfig, DatabaseUrlError, describeDatabase } from "./connection.mjs";

const NEON =
  "postgresql://app:s3cret@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const params = (url: string) => new URL(url).searchParams;

describe("connectionConfig", () => {
  it("makes Neon's pooled connection string work with postgres.js", () => {
    const { url, options } = connectionConfig(NEON, { env: {} });
    // postgres.js would send channel_binding to the server as an unknown setting.
    expect(params(url).has("channel_binding")).toBe(false);
    // Neon's certificates are publicly trusted, so they are verified.
    expect(params(url).get("sslmode")).toBe("verify-full");
    // Transaction-mode poolers cannot keep prepared statements.
    expect(options.prepare).toBe(false);
    expect(new URL(url).password).toBe("s3cret");
  });

  it("verifies certificates for remote hosts without an sslmode", () => {
    const { url } = connectionConfig("postgres://u:p@db.example.com:5432/gitdojo", { env: {} });
    expect(params(url).get("sslmode")).toBe("verify-full");
  });

  it("keeps an explicit encrypted mode for other providers", () => {
    for (const mode of ["require", "verify-ca", "verify-full"]) {
      const { url } = connectionConfig(`postgres://u:p@db.example.com/x?sslmode=${mode}`, {
        env: {},
      });
      expect(params(url).get("sslmode")).toBe(mode);
    }
  });

  it.each(["disable", "allow", "prefer"])("refuses sslmode=%s for remote hosts", (mode) => {
    expect(() =>
      connectionConfig(`postgres://u:p@db.example.com/x?sslmode=${mode}`, { env: {} }),
    ).toThrow(DatabaseUrlError);
  });

  it("allows plain connections to local and Docker Compose hosts", () => {
    for (const host of ["localhost:5432", "127.0.0.1", "[::1]:5432", "db", "postgres"]) {
      const { url } = connectionConfig(`postgres://gitdojo:gitdojo@${host}/gitdojo`, { env: {} });
      expect(params(url).has("sslmode")).toBe(false);
    }
  });

  it("bounds the pool for serverless instances", () => {
    expect(connectionConfig(NEON, { env: {} }).options.max).toBe(5);
    expect(connectionConfig(NEON, { env: { DATABASE_POOL_MAX: "2" } }).options.max).toBe(2);
    for (const invalid of ["0", "500", "many"]) {
      expect(connectionConfig(NEON, { env: { DATABASE_POOL_MAX: invalid } }).options.max).toBe(5);
    }
    expect(connectionConfig(NEON, { purpose: "migrate", env: {} }).options.max).toBe(1);
  });

  it("rejects malformed URLs without echoing them", () => {
    for (const bad of ["not a url", "mysql://u:secret@host/db"]) {
      expect(() => connectionConfig(bad, { env: {} })).toThrow(DatabaseUrlError);
      try {
        connectionConfig(bad, { env: {} });
      } catch (error) {
        expect((error as Error).message).not.toContain("secret");
      }
    }
  });
});

describe("describeDatabase", () => {
  it("names the host and database, never the credentials", () => {
    const text = describeDatabase(NEON);
    expect(text).toBe("ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb");
    expect(text).not.toContain("s3cret");
  });
});
