import { DatabaseNotConfiguredError, type Database } from "@/lib/db/client";
import { LATEST_MIGRATION } from "@/lib/db/schema";

export type DatabaseHealth =
  /** No `DATABASE_URL`: anonymous learning works, account progress is off. */
  | "unconfigured"
  /** Reachable and migrated to {@link LATEST_MIGRATION}. */
  | "ok"
  /** Reachable, but the latest migration has not been applied: run `pnpm db:migrate`. */
  | "outdated"
  /** The database could not be reached or the URL is unusable. */
  | "unavailable";

export interface HealthResponse {
  status: "ok" | "degraded";
  database: DatabaseHealth;
}

const UNDEFINED_TABLE = "42P01";

async function databaseHealth(database: () => Database): Promise<DatabaseHealth> {
  let sql: Database;
  try {
    sql = database();
  } catch (error) {
    return error instanceof DatabaseNotConfiguredError ? "unconfigured" : "unavailable";
  }
  try {
    const rows = await sql`
      SELECT 1 FROM gitdojo_schema_migrations WHERE version = ${LATEST_MIGRATION}
    `;
    return rows.length === 1 ? "ok" : "outdated";
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === UNDEFINED_TABLE) return "outdated";
    // Named by SQLSTATE or Node's error code: class names are minified in production builds.
    console.error(
      "[gitdojo] health check could not reach the database:",
      typeof code === "string"
        ? `error ${code}`
        : error instanceof Error
          ? error.name
          : "unknown error",
    );
    return "unavailable";
  }
}

/**
 * `GET /api/health`: whether this deployment can serve account progress. Public and never cached;
 * reports states, not details. 503 when a configured database is unreachable or not migrated, so
 * release smoke tests and uptime monitors catch it. Never runs migrations.
 */
export async function getHealth(database: () => Database): Promise<Response> {
  const db = await databaseHealth(database);
  const healthy = db === "ok" || db === "unconfigured";
  const body: HealthResponse = { status: healthy ? "ok" : "degraded", database: db };
  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
