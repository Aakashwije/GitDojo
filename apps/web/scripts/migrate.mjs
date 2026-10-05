// Applies the SQL migrations in db/migrations/ to the database at DATABASE_URL, in order.
//
//   pnpm db:migrate                 apply pending migrations (safe to run any number of times)
//   pnpm db:migrate --dir <path>    use another migrations directory (tests)
//
// Connects to DATABASE_URL_UNPOOLED when set (Neon's direct connection, preferred for schema
// changes), otherwise DATABASE_URL. Remote databases must use TLS (see lib/db/connection.mjs).
//
// Each migration runs in its own transaction together with its ledger row, under an advisory
// lock, so concurrent runs (several deploy instances) apply it once. A migration that changed
// after it was applied stops the run: add a new numbered file instead of editing an old one.
// The connection string is never printed.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";
import { connectionConfig, describeDatabase } from "../lib/db/connection.mjs";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
// Any constant shared by every runner; serializes migrations across processes.
const LOCK_KEY = 4_812_390_117;

export async function listMigrations(directory) {
  const names = (await readdir(directory)).filter((name) => MIGRATION_FILE.test(name)).sort();
  return Promise.all(
    names.map(async (name) => {
      const text = await readFile(join(directory, name), "utf8");
      return { version: name.replace(/\.sql$/, ""), text, checksum: sha256(text) };
    }),
  );
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Applies pending migrations; returns the versions applied by this run. */
export async function migrate(sql, directory, log = () => undefined) {
  const migrations = await listMigrations(directory);
  // Under the lock too: concurrent `CREATE TABLE IF NOT EXISTS` can still collide.
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    await tx`
      CREATE TABLE IF NOT EXISTS gitdojo_schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  });

  const applied = [];
  for (const migration of migrations) {
    const ran = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      const [existing] = await tx`
        SELECT checksum FROM gitdojo_schema_migrations WHERE version = ${migration.version}
      `;
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.version} changed after it was applied. ` +
              "Restore the original file and add a new migration instead.",
          );
        }
        return false;
      }
      await tx.unsafe(migration.text).simple();
      await tx`
        INSERT INTO gitdojo_schema_migrations (version, checksum)
        VALUES (${migration.version}, ${migration.checksum})
      `;
      return true;
    });
    if (ran) {
      applied.push(migration.version);
      log(`Applied ${migration.version}`);
    }
  }
  return applied;
}

function loadLocalEnv() {
  // Same files as `next dev`, for local use; releases set the URL in the environment.
  if (typeof process.loadEnvFile !== "function") return; // Node < 20.12
  for (const file of [".env.local", ".env"]) {
    const path = join(appDir, file);
    const unset =
      process.env.DATABASE_URL === undefined && process.env.DATABASE_URL_UNPOOLED === undefined;
    if (unset && existsSync(path)) process.loadEnvFile(path);
  }
}

async function main(args) {
  const dirFlag = args.indexOf("--dir");
  const directory =
    dirFlag === -1 ? join(appDir, "db", "migrations") : resolve(args[dirFlag + 1] ?? "");

  loadLocalEnv();
  const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. See docs/account-progress.md.");
    return 1;
  }

  let config;
  try {
    config = connectionConfig(url, { purpose: "migrate" });
  } catch (error) {
    console.error(`Migration failed: ${error instanceof Error ? error.message : "invalid URL"}`);
    return 1;
  }
  console.log(`Migrating ${describeDatabase(url)}`);
  const sql = postgres(config.url, config.options);
  try {
    const applied = await migrate(sql, directory, (line) => console.log(line));
    console.log(
      applied.length === 0
        ? "Database is up to date."
        : `Applied ${String(applied.length)} migration(s).`,
    );
    return 0;
  } catch (error) {
    // Messages from our own checks and PostgreSQL errors (no connection string) only.
    const code = typeof error?.code === "string" ? ` (${error.code})` : "";
    console.error(`Migration failed${code}: ${error instanceof Error ? error.message : "unknown"}`);
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
