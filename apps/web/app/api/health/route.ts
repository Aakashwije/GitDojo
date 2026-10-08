import { connection } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { probeDatabase } from "@/lib/db/probe";
import { getHealth } from "@/lib/health";

/** Deployment health for smoke tests and uptime monitors. See `getHealth`. */
export async function GET() {
  // Always per request: never prerendered at build time.
  await connection();
  return getHealth(() => probeDatabase(getDatabase));
}
