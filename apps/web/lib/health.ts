import { type DatabaseHealth } from "@/lib/db/probe";

export type { DatabaseHealth };

export interface HealthResponse {
  status: "ok" | "degraded";
  database: DatabaseHealth;
}

/**
 * `GET /api/health`: whether this deployment can serve account progress. Public and never cached;
 * reports states, not details. 503 when a configured database is unreachable or not migrated, so
 * release smoke tests and uptime monitors catch it. Never runs migrations.
 */
export async function getHealth(probe: () => Promise<DatabaseHealth>): Promise<Response> {
  const db = await probe();
  const healthy = db === "ok" || db === "unconfigured";
  const body: HealthResponse = { status: healthy ? "ok" : "degraded", database: db };
  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
