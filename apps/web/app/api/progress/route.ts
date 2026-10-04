import { connection } from "next/server";
import { getProgress } from "@/lib/account-progress/api";
import { progressApiDeps } from "@/lib/account-progress/deps";

/**
 * The signed-in learner's completed lessons and total XP, from their account. Anonymous
 * progress stays in the browser (IndexedDB) and is never read or changed here.
 */
export async function GET() {
  // Always per request: never prerendered at build time, whatever the configuration.
  await connection();
  return getProgress(progressApiDeps());
}
