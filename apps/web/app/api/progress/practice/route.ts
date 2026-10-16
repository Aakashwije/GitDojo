import { recordPracticeCompletion } from "@/lib/account-progress/api";
import { progressApiDeps } from "@/lib/account-progress/deps";

/** Records a solved Practice mode task for the signed-in learner. See `recordPracticeCompletion`. */
export async function POST(request: Request) {
  return recordPracticeCompletion(request, progressApiDeps());
}
