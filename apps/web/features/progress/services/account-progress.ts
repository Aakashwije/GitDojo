import { type CompletionRecord } from "@gitdojo/progress";
import { type LessonType } from "@gitdojo/shared-types";

/** Lesson completions saved to the learner's account, keyed by lesson id. */
export type AccountLessons = Record<string, CompletionRecord>;

export type AccountProgressResult =
  | { status: "ok"; accountId: string; lessons: AccountLessons }
  /** No valid session (never signed in, signed out, or the session ended). */
  | { status: "signed-out" }
  /** The account service could not answer: identity provider or database unavailable. */
  | { status: "unavailable" };

export type LessonUploadResult =
  | { status: "ok"; lessonId: string; record: CompletionRecord }
  | { status: "signed-out" }
  | { status: "unavailable" }
  /** The server refused this lesson (for example, it no longer exists). Retrying won't help. */
  | { status: "rejected" };

const LESSON_TYPES: readonly string[] = ["concept", "interactive", "challenge"];

interface ApiLesson {
  lessonId?: unknown;
  type?: unknown;
  course?: unknown;
  xp?: unknown;
  completedAt?: unknown;
}

function toRecord(lesson: ApiLesson): [string, CompletionRecord] | null {
  const completedAt =
    typeof lesson.completedAt === "string" ? Date.parse(lesson.completedAt) : Number.NaN;
  if (
    typeof lesson.lessonId !== "string" ||
    typeof lesson.type !== "string" ||
    !LESSON_TYPES.includes(lesson.type) ||
    typeof lesson.xp !== "number" ||
    !Number.isFinite(completedAt)
  ) {
    return null;
  }
  const course = lesson.course as { id?: unknown } | null | undefined;
  return [
    lesson.lessonId,
    {
      completedAt,
      xp: lesson.xp,
      type: lesson.type as LessonType,
      ...(typeof course?.id === "string" ? { courseId: course.id } : {}),
    },
  ];
}

const REQUEST: RequestInit = { cache: "no-store", credentials: "same-origin" };

/** Reads the signed-in learner's account progress. Never throws. */
export async function fetchAccountProgress(
  fetcher: typeof fetch = fetch,
): Promise<AccountProgressResult> {
  try {
    const response = await fetcher("/api/progress", REQUEST);
    if (response.status === 401) return { status: "signed-out" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as {
      account?: { id?: unknown };
      completedLessons?: unknown;
    };
    const accountId = body.account?.id;
    if (typeof accountId !== "string" || !Array.isArray(body.completedLessons)) {
      return { status: "unavailable" };
    }
    const lessons: AccountLessons = {};
    for (const lesson of body.completedLessons as ApiLesson[]) {
      const entry = toRecord(lesson);
      if (entry) lessons[entry[0]] = entry[1];
    }
    return { status: "ok", accountId, lessons };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Saves one lesson completion to the account. Idempotent on the server, so retries are safe; the
 * result carries the account's record (its first completion time and XP).
 */
export async function uploadLessonCompletion(
  lessonId: string,
  fetcher: typeof fetch = fetch,
): Promise<LessonUploadResult> {
  try {
    const response = await fetcher("/api/progress/lessons", {
      ...REQUEST,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId }),
    });
    if (response.status === 401) return { status: "signed-out" };
    if (response.status >= 500 || response.status === 429) return { status: "unavailable" };
    if (!response.ok) return { status: "rejected" };
    const body = (await response.json()) as { lesson?: ApiLesson };
    const entry = body.lesson ? toRecord(body.lesson) : null;
    return entry ? { status: "ok", lessonId: entry[0], record: entry[1] } : { status: "rejected" };
  } catch {
    return { status: "unavailable" };
  }
}
