// @vitest-environment node
import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DatabaseNotConfiguredError, type Database } from "@/lib/db/client";
import { LATEST_MIGRATION } from "@/lib/db/schema";
import { probeDatabase } from "@/lib/db/probe";
import { getHealth as getHealthFor } from "./health";

/** The health endpoint over the real database probe, with a fake connection. */
const getHealth = (database: () => Database) => getHealthFor(() => probeDatabase(database));

vi.mock("server-only", () => ({}));

/** A stand-in for the postgres.js tagged template. */
function fakeDatabase(result: () => Promise<unknown[]>): () => Database {
  return () => (() => result()) as unknown as Database;
}

const read = async (response: Response) => ({
  status: response.status,
  cache: response.headers.get("cache-control"),
  body: (await response.json()) as unknown,
});

describe("getHealth", () => {
  it("is healthy without a database: anonymous learning still works", async () => {
    const response = await getHealth(() => {
      throw new DatabaseNotConfiguredError();
    });
    expect(await read(response)).toEqual({
      status: 200,
      cache: "no-store",
      body: { status: "ok", database: "unconfigured" },
    });
  });

  it("is healthy when the latest migration is applied", async () => {
    const response = await getHealth(fakeDatabase(() => Promise.resolve([{ "?column?": 1 }])));
    expect(await read(response)).toMatchObject({ status: 200, body: { database: "ok" } });
  });

  it("reports an unmigrated database", async () => {
    for (const query of [
      () => Promise.resolve([]),
      () => Promise.reject(Object.assign(new Error("no table"), { code: "42P01" })),
    ]) {
      const response = await getHealth(fakeDatabase(query));
      expect(await read(response)).toMatchObject({
        status: 503,
        body: { status: "degraded", database: "outdated" },
      });
    }
  });

  it("reports an unreachable database without details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await getHealth(
      fakeDatabase(() => Promise.reject(new Error("connect ECONNREFUSED db.internal:5432"))),
    );
    const result = await read(response);
    expect(result).toMatchObject({ status: 503, body: { database: "unavailable" } });
    expect(JSON.stringify(result.body)).not.toContain("db.internal");
    log.mockRestore();
  });
});

describe("LATEST_MIGRATION", () => {
  it("names the newest file in db/migrations", async () => {
    const dir = path.resolve(import.meta.dirname, "..", "db", "migrations");
    const versions = (await readdir(dir))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort();
    expect(LATEST_MIGRATION).toBe(versions.at(-1));
  });
});
