import { recordLessonCompletion } from "@/lib/account-progress/api";
import { progressApiDeps } from "@/lib/account-progress/deps";

/** Records a completed lesson for the signed-in learner. See `recordLessonCompletion`. */
export async function POST(request: Request) {
  return recordLessonCompletion(request, progressApiDeps());
}
