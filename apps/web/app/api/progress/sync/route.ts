import { syncProgress } from "@/lib/account-progress/api";
import { progressApiDeps } from "@/lib/account-progress/deps";

/** Merges this device's activity into the signed-in learner's account. See `syncProgress`. */
export async function POST(request: Request) {
  return syncProgress(request, progressApiDeps());
}
