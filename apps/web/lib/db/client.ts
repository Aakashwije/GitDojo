import "server-only";

import postgres from "postgres";

export type Database = postgres.Sql;

/** `DATABASE_URL` is missing: account progress is unavailable, anonymous learning is not. */
export class DatabaseNotConfiguredError extends Error {
  override name = "DatabaseNotConfiguredError";
  constructor() {
    super("DATABASE_URL is not set");
  }
}

// Read through a variable so the value is looked up at runtime instead of inlined at build time.
const runtimeEnv: Record<string, string | undefined> = process.env;

// One pool per server process; kept on globalThis so development reloads don't leak connections.
const pool = globalThis as typeof globalThis & { gitdojoDatabase?: Database };

/**
 * The PostgreSQL connection pool for `DATABASE_URL`, created on first use. Server-only: the
 * connection string never reaches the browser or the logs. Queries use postgres.js tagged
 * templates, which always send values as parameters.
 */
export function getDatabase(): Database {
  if (pool.gitdojoDatabase) return pool.gitdojoDatabase;
  const url = runtimeEnv.DATABASE_URL?.trim();
  if (!url) throw new DatabaseNotConfiguredError();
  pool.gitdojoDatabase = postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => undefined,
    connection: { application_name: "gitdojo-web" },
  });
  return pool.gitdojoDatabase;
}
