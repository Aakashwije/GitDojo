import { recordChallengeCompletion } from "@/lib/account-progress/api";
import { progressApiDeps } from "@/lib/account-progress/deps";

/** Records a completed challenge for the signed-in learner. See `recordChallengeCompletion`. */
export async function POST(request: Request) {
  return recordChallengeCompletion(request, progressApiDeps());
}
