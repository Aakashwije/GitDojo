import { completionXp, indexLessons, type ProgressCatalog } from "@gitdojo/progress";
import { type IdentityResult } from "@/lib/auth/identity";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { type AccountProgressStore, type StoredCompletion } from "./store";

/** Everything the progress endpoints depend on, injectable for tests. */
export interface ProgressApiDeps {
  verifyIdentity: () => Promise<IdentityResult>;
  /** Throws {@link DatabaseNotConfiguredError} without `DATABASE_URL`. */
  store: () => AccountProgressStore;
  catalog: () => Promise<ProgressCatalog>;
}

/** A completed lesson as the API returns it; metadata comes from the current content. */
export interface CompletedLesson {
  lessonId: string;
  /** Null when the lesson no longer exists in the content. */
  title: string | null;
  type: StoredCompletion["lessonType"];
  course: { id: string; slug: string; title: string } | null;
  xp: number;
  completedAt: string;
}

export interface ProgressResponse {
  /** Opaque and stable per account; the browser keys its local cache by it. */
  account: { id: string };
  completedLessons: CompletedLesson[];
  completedChallenges: {
    challengeId: string;
    title: string | null;
    xp: number;
    completedAt: string;
  }[];
  totalXp: number;
}

export interface RecordLessonResponse {
  lesson: CompletedLesson;
  /** True when the lesson had been completed before: nothing changed. */
  alreadyCompleted: boolean;
  totalXp: number;
}

/** Lesson ids are content slugs (`git-init`), as the lesson schema requires. */
const LESSON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LESSON_ID_LENGTH = 100;
const MAX_BODY_BYTES = 1024;

// Private, per-learner data: never stored by browsers or shared caches.
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}

function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

const unauthenticated = () =>
  error(401, "unauthenticated", "Sign in to save progress to your account.");

const identityUnavailable = () =>
  error(503, "identity_unavailable", "We couldn't confirm your sign-in. Try again shortly.");

class ProgressStepError extends Error {
  constructor(
    readonly step: "database" | "catalog",
    cause: unknown,
  ) {
    super("Progress dependency failed", { cause });
  }
}

async function progressStep<T>(
  step: "database" | "catalog",
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw new ProgressStepError(step, cause);
  }
}

/** Database and other unexpected failures: a generic message, logged without details or data. */
function failure(cause: unknown): Response {
  const step = cause instanceof ProgressStepError ? cause.step : "response";
  if (cause instanceof ProgressStepError) cause = cause.cause;
  if (cause instanceof DatabaseNotConfiguredError) {
    return error(503, "progress_unavailable", "Account progress isn't available right now.");
  }
  const code =
    typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : undefined;
  // Database errors are named by their SQLSTATE: class names are minified in production builds.
  console.error(
    "[gitdojo] account progress request failed:",
    code ? `database error ${code}` : cause instanceof Error ? cause.name : "unknown error",
    `step=${step}`,
  );
  return error(500, "internal_error", "Something went wrong. Your progress was not changed.");
}

function present(
  completion: StoredCompletion,
  lessons: ReturnType<typeof indexLessons>,
): CompletedLesson {
  const lesson = lessons.get(completion.lessonId);
  return {
    lessonId: completion.lessonId,
    title: lesson?.title ?? null,
    type: completion.lessonType,
    course: lesson?.course ?? null,
    xp: completion.xp,
    completedAt: completion.completedAt.toISOString(),
  };
}

const sumXp = (completions: StoredCompletion[]) =>
  completions.reduce((sum, completion) => sum + completion.xp, 0);

/** `GET /api/progress`: the signed-in learner's completed lessons and total XP. */
export async function getProgress(deps: ProgressApiDeps): Promise<Response> {
  const verified = await deps.verifyIdentity();
  if (verified.status === "unauthenticated") return unauthenticated();
  if (verified.status === "unavailable") return identityUnavailable();

  try {
    const [{ accountId, completions }, catalog] = await Promise.all([
      progressStep("database", () => deps.store().read(verified.identity)),
      progressStep("catalog", () => deps.catalog()),
    ]);
    const lessons = indexLessons(catalog);
    const body: ProgressResponse = {
      account: { id: accountId },
      completedLessons: completions
        .filter((c) => c.kind !== "challenge")
        .map((c) => present(c, lessons)),
      completedChallenges: completions
        .filter((c) => c.kind === "challenge")
        .map((c) => ({
          challengeId: c.lessonId,
          title: catalog.challenges.find((item) => item.id === c.lessonId)?.title ?? null,
          xp: c.xp,
          completedAt: c.completedAt.toISOString(),
        })),
      totalXp: sumXp(completions),
    };
    return json(body);
  } catch (cause) {
    return failure(cause);
  }
}

/** Reads at most `limit` bytes of the body; null when it is longer. */
async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

type ParsedBody = { ok: true; lessonId: string } | { ok: false; response: Response };

async function parseRecordBody(
  request: Request,
  field: "lessonId" | "challengeId" = "lessonId",
): Promise<ParsedBody> {
  const invalid = (status: number, code: string, message: string): ParsedBody => ({
    ok: false,
    response: error(status, code, message),
  });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return invalid(415, "unsupported_media_type", "Send the request body as application/json.");
  }
  const text = await readBody(request, MAX_BODY_BYTES);
  if (text === null) return invalid(413, "payload_too_large", "The request body is too large.");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return invalid(400, "invalid_json", "The request body is not valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalid(400, "invalid_body", "Send a JSON object with the content id.");
  }
  const unexpected = Object.keys(body).filter((key) => key !== field);
  if (unexpected.length > 0) {
    return invalid(
      400,
      "unexpected_fields",
      `Only ${field} may be sent; XP, ownership and timestamps are set by the server (got: ${unexpected.slice(0, 5).join(", ")}).`,
    );
  }
  const lessonId = (body as Record<string, unknown>)[field];
  if (
    typeof lessonId !== "string" ||
    lessonId.length > MAX_LESSON_ID_LENGTH ||
    !LESSON_ID.test(lessonId)
  ) {
    return invalid(
      400,
      `invalid_${field === "challengeId" ? "challenge" : "lesson"}_id`,
      `${field} must be a content id such as git-init.`,
    );
  }
  return { ok: true, lessonId };
}

/**
 * `POST /api/progress/lessons` with `{"lessonId": "..."}`: records that the signed-in learner
 * completed a lesson. Idempotent: 201 the first time, 200 with `alreadyCompleted` afterwards,
 * and XP is only ever awarded once. XP, type and course come from the content catalog.
 *
 * This is learner-reported progress: the server checks that the lesson exists, not that its
 * exercises were solved.
 */
export async function recordLessonCompletion(
  request: Request,
  deps: ProgressApiDeps,
): Promise<Response> {
  // Before anything else: a cross-site page must not be able to write with the learner's cookie.
  if (!isSameOriginRequest(request.headers)) {
    return error(403, "cross_origin", "Cross-origin requests are not allowed.");
  }

  const verified = await deps.verifyIdentity();
  if (verified.status === "unauthenticated") return unauthenticated();
  if (verified.status === "unavailable") return identityUnavailable();

  const parsed = await parseRecordBody(request);
  if (!parsed.ok) return parsed.response;

  try {
    const lessons = indexLessons(await progressStep("catalog", () => deps.catalog()));
    const lesson = lessons.get(parsed.lessonId);
    if (!lesson) return error(422, "unknown_lesson", "There is no lesson with that id.");

    const result = await progressStep("database", () =>
      deps.store().recordLesson(verified.identity, {
        lessonId: lesson.id,
        lessonType: lesson.type,
        courseId: lesson.course?.id ?? null,
        xp: completionXp({ kind: "lesson", id: lesson.id, type: lesson.type }),
      }),
    );
    const body: RecordLessonResponse = {
      lesson: present(result.completion, lessons),
      alreadyCompleted: !result.created,
      totalXp: sumXp(result.completions),
    };
    return json(body, result.created ? 201 : 200);
  } catch (cause) {
    return failure(cause);
  }
}

/** Records a standalone challenge, with ownership and XP determined on the server. */
export async function recordChallengeCompletion(
  request: Request,
  deps: ProgressApiDeps,
): Promise<Response> {
  if (!isSameOriginRequest(request.headers))
    return error(403, "cross_origin", "Cross-origin requests are not allowed.");
  const verified = await deps.verifyIdentity();
  if (verified.status === "unauthenticated") return unauthenticated();
  if (verified.status === "unavailable") return identityUnavailable();
  const parsed = await parseRecordBody(request, "challengeId");
  if (!parsed.ok) return parsed.response;
  try {
    const catalog = await progressStep("catalog", () => deps.catalog());
    const challenge = catalog.challenges.find((item) => item.id === parsed.lessonId);
    if (!challenge) return error(422, "unknown_challenge", "There is no challenge with that id.");
    const result = await progressStep("database", () =>
      deps.store().recordLesson(verified.identity, {
        kind: "challenge",
        lessonId: challenge.id,
        lessonType: "challenge",
        courseId: null,
        xp: completionXp({ kind: "challenge", id: challenge.id }),
      }),
    );
    return json(
      {
        challenge: {
          challengeId: challenge.id,
          title: challenge.title,
          xp: result.completion.xp,
          completedAt: result.completion.completedAt.toISOString(),
        },
        alreadyCompleted: !result.created,
        totalXp: sumXp(result.completions),
      },
      result.created ? 201 : 200,
    );
  } catch (cause) {
    return failure(cause);
  }
}
