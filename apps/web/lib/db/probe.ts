import { DatabaseNotConfiguredError, type Database } from "./client";
import { LATEST_MIGRATION } from "./schema";

export type DatabaseHealth =
  /** No `DATABASE_URL`: anonymous learning works, account progress is off. */
  | "unconfigured"
  /** Reachable and migrated to {@link LATEST_MIGRATION}. */
  | "ok"
  /** Reachable, but the latest migration has not been applied: run `pnpm db:migrate`. */
  | "outdated"
  /** The database could not be reached or the URL is unusable. */
  | "unavailable";

const UNDEFINED_TABLE = "42P01";

/**
 * The database adapter for the health check: whether `DATABASE_URL` is set, reachable and
 * migrated. Never throws and never runs migrations.
 */
export async function probeDatabase(database: () => Database): Promise<DatabaseHealth> {
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
