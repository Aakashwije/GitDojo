// PostgreSQL connection settings shared by the app (lib/db/client.ts) and the migration command
// (scripts/migrate.mjs). Plain JavaScript so the command runs with Node alone; types are in
// connection.d.mts. Never logs or returns the password.

/** The connection string cannot be used safely; the message never contains it. */
export class DatabaseUrlError extends Error {
  name = "DatabaseUrlError";
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ENCRYPTED = new Set(["require", "verify-ca", "verify-full"]);

/**
 * Hosts that may connect without TLS: loopback, and single-label names such as a Docker Compose
 * service (`db`, `postgres`). Every managed database host has a dotted name and must use TLS.
 */
function isPrivateHost(hostname) {
  return LOOPBACK.has(hostname) || (hostname !== "" && !hostname.includes("."));
}

function poolSize(value, fallback) {
  const size = Number(value);
  return Number.isInteger(size) && size >= 1 && size <= 20 ? size : fallback;
}

/**
 * The URL and postgres.js options for a connection string.
 *
 * - Remote hosts must use TLS. Without `sslmode` the certificate is verified (`verify-full`);
 *   `sslmode=disable`, `allow` or `prefer` are refused. Neon's `sslmode=require` is upgraded to
 *   `verify-full`, since Neon's certificates are publicly trusted.
 * - `channel_binding` (in Neon's connection strings) is removed: postgres.js does not support it
 *   and would send it to the server as an unknown setting, failing every connection.
 * - Prepared statements are off, so transaction-mode poolers (Neon's `-pooler` host, PgBouncer)
 *   work. GitDojo's few small queries don't benefit from them.
 * - The pool is bounded (`DATABASE_POOL_MAX`, default 5) because every serverless instance has
 *   its own; idle connections close after 20 seconds.
 *
 * @param {string} connectionString
 * @param {{ purpose?: "app" | "migrate", env?: Record<string, string | undefined> }} [options]
 */
export function connectionConfig(connectionString, { purpose = "app", env = process.env } = {}) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseUrlError("The database URL is not a valid URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new DatabaseUrlError("The database URL must start with postgres:// or postgresql://.");
  }

  url.searchParams.delete("channel_binding");
  const hostname = url.hostname.toLowerCase();
  const sslmode = url.searchParams.get("sslmode")?.toLowerCase() ?? null;
  if (!isPrivateHost(hostname)) {
    if (sslmode === null) {
      url.searchParams.set("sslmode", "verify-full");
    } else if (!ENCRYPTED.has(sslmode)) {
      throw new DatabaseUrlError(
        `Remote databases must use TLS: sslmode=${sslmode} is not allowed. Use sslmode=verify-full.`,
      );
    } else if (sslmode === "require" && hostname.endsWith(".neon.tech")) {
      url.searchParams.set("sslmode", "verify-full");
    }
  }

  const migrate = purpose === "migrate";
  return {
    url: url.toString(),
    options: {
      max: migrate ? 1 : poolSize(env.DATABASE_POOL_MAX, 5),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined,
      connection: { application_name: migrate ? "gitdojo-migrate" : "gitdojo-web" },
    },
  };
}

/** Where a URL points, for messages: host and database only, never credentials. */
export function describeDatabase(connectionString) {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}/${decodeURIComponent(url.pathname.slice(1))}`;
  } catch {
    return "an invalid URL";
  }
}
