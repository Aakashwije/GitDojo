import "server-only";

import postgres from "postgres";
import { connectionConfig } from "./connection.mjs";

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

// One pool per server instance; kept on globalThis so development reloads don't leak connections.
const pool = globalThis as typeof globalThis & { gitdojoDatabase?: Database };

/**
 * The PostgreSQL connection pool for `DATABASE_URL`, created on first use. Server-only: the
 * connection string never reaches the browser or the logs. Queries use postgres.js tagged
 * templates, which always send values as parameters. Connection settings (TLS, pooler
 * compatibility, pool size) are in `connection.mjs`. Migrations never run from here: they run
 * once per release with `pnpm db:migrate`.
 */
export function getDatabase(): Database {
  if (pool.gitdojoDatabase) return pool.gitdojoDatabase;
  const url = runtimeEnv.DATABASE_URL?.trim();
  if (!url) throw new DatabaseNotConfiguredError();
  const config = connectionConfig(url, { env: runtimeEnv });
  pool.gitdojoDatabase = postgres(config.url, config.options);
  return pool.gitdojoDatabase;
}
