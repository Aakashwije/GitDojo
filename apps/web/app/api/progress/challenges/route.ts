import { recordChallengeCompletion } from "@/lib/account-progress/api";
import { progressApiDeps } from "@/lib/account-progress/deps";
export async function POST(request: Request) {
  return recordChallengeCompletion(request, progressApiDeps());
}
