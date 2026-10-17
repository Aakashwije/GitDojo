// Operational CLI for revoking an incorrectly issued certificate. Never expose this as a public API.
// Run from apps/web: node scripts/revoke-certificate.mjs <credential-uuid>
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { connectionConfig } from "../lib/db/connection.mjs";

const id = process.argv[2];
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  console.error("Usage: node scripts/revoke-certificate.mjs <credential-uuid>");
  process.exitCode = 2;
} else {
  const app = fileURLToPath(new URL("..", import.meta.url));
  if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
    for (const name of [".env.local", ".env"]) {
      const file = join(app, name);
      if (existsSync(file)) process.loadEnvFile(file);
    }
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const config = connectionConfig(url, { purpose: "migrate" });
  const sql = postgres(config.url, config.options);
  try {
    const rows = await sql`
      UPDATE certificates SET revoked_at = COALESCE(revoked_at, now())
      WHERE id = ${id} RETURNING id, revoked_at
    `;
    if (rows.length !== 1) throw new Error("Certificate not found");
    console.log(`Revoked ${id} at ${rows[0].revoked_at.toISOString()}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
