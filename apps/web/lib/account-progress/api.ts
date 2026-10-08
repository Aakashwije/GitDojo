import { indexLessons, type ProgressCatalog } from "@gitdojo/progress";
import { type VerifiedIdentity } from "@/lib/auth/identity";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { type CompletionKind, type ProgressApiDeps, type StoredCompletion } from "./ports";
import {
  ProgressStepError,
  readAccountProgress,
  recordCompletion,
  type RecordOutcome,
} from "./service";

/**
 * The HTTP adapter for account progress: parses and checks requests, runs the use cases in
 * `service.ts`, and maps their results and failures to responses. Route handlers in
 * `app/api/progress` only wire this to the real dependencies (`deps.ts`).
 */

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
  completedChallenges: CompletedChallenge[];
  totalXp: number;
}

export interface CompletedChallenge {
  challengeId: string;
  /** Null when the challenge no longer exists in the content. */
  title: string | null;
  xp: number;
  completedAt: string;
}

export interface RecordLessonResponse {
  lesson: CompletedLesson;
  /** True when the lesson had been completed before: nothing changed. */
  alreadyCompleted: boolean;
  totalXp: number;
}

export interface RecordChallengeResponse {
  challenge: CompletedChallenge;
  /** True when the challenge had been completed before: nothing changed. */
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

function presentChallenge(
  completion: StoredCompletion,
  catalog: ProgressCatalog,
): CompletedChallenge {
  return {
    challengeId: completion.lessonId,
    title: catalog.challenges.find((item) => item.id === completion.lessonId)?.title ?? null,
    xp: completion.xp,
    completedAt: completion.completedAt.toISOString(),
  };
}

/** The verified identity, or the response that refuses the request. */
async function verify(
  deps: ProgressApiDeps,
): Promise<{ ok: true; identity: VerifiedIdentity } | { ok: false; response: Response }> {
  const verified = await deps.verifyIdentity();
  if (verified.status === "unauthenticated") return { ok: false, response: unauthenticated() };
  if (verified.status === "unavailable") return { ok: false, response: identityUnavailable() };
  return { ok: true, identity: verified.identity };
}

/** `GET /api/progress`: the signed-in learner's completed lessons and total XP. */
export async function getProgress(deps: ProgressApiDeps): Promise<Response> {
  const verified = await verify(deps);
  if (!verified.ok) return verified.response;

  try {
    const { accountId, completions, catalog, totalXp } = await readAccountProgress(
      deps,
      verified.identity,
    );
    const lessons = indexLessons(catalog);
    const body: ProgressResponse = {
      account: { id: accountId },
      completedLessons: completions
        .filter((c) => c.kind !== "challenge")
        .map((c) => present(c, lessons)),
      completedChallenges: completions
        .filter((c) => c.kind === "challenge")
        .map((c) => presentChallenge(c, catalog)),
      totalXp,
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

type ParsedBody = { ok: true; id: string } | { ok: false; response: Response };

/** The content id from a record request's body: exactly `{ [field]: "<content-id>" }`. */
async function parseRecordBody(
  request: Request,
  field: "lessonId" | "challengeId",
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
  const id = (body as Record<string, unknown>)[field];
  if (typeof id !== "string" || id.length > MAX_LESSON_ID_LENGTH || !LESSON_ID.test(id)) {
    return invalid(
      400,
      `invalid_${field === "challengeId" ? "challenge" : "lesson"}_id`,
      `${field} must be a content id such as git-init.`,
    );
  }
  return { ok: true, id };
}

type Recorded = Extract<RecordOutcome, { status: "recorded" }>;

/** How each completion kind appears in the HTTP API. Adding a completable kind starts in `service.ts`. */
const RECORD_ENDPOINTS: Record<
  CompletionKind,
  {
    field: "lessonId" | "challengeId";
    unknown: { code: string; message: string };
    present: (outcome: Recorded) => object;
  }
> = {
  lesson: {
    field: "lessonId",
    unknown: { code: "unknown_lesson", message: "There is no lesson with that id." },
    present: (outcome): RecordLessonResponse => ({
      lesson: present(outcome.completion, indexLessons(outcome.catalog)),
      alreadyCompleted: !outcome.created,
      totalXp: outcome.totalXp,
    }),
  },
  challenge: {
    field: "challengeId",
    unknown: { code: "unknown_challenge", message: "There is no challenge with that id." },
    present: (outcome): RecordChallengeResponse => ({
      challenge: presentChallenge(outcome.completion, outcome.catalog),
      alreadyCompleted: !outcome.created,
      totalXp: outcome.totalXp,
    }),
  },
};

async function recordCompletionRequest(
  kind: CompletionKind,
  request: Request,
  deps: ProgressApiDeps,
): Promise<Response> {
  // Before anything else: a cross-site page must not be able to write with the learner's cookie.
  if (!isSameOriginRequest(request.headers)) {
    return error(403, "cross_origin", "Cross-origin requests are not allowed.");
  }

  const verified = await verify(deps);
  if (!verified.ok) return verified.response;

  const endpoint = RECORD_ENDPOINTS[kind];
  const parsed = await parseRecordBody(request, endpoint.field);
  if (!parsed.ok) return parsed.response;

  try {
    const outcome = await recordCompletion(deps, verified.identity, kind, parsed.id);
    if (outcome.status === "unknown") {
      return error(422, endpoint.unknown.code, endpoint.unknown.message);
    }
    return json(endpoint.present(outcome), outcome.created ? 201 : 200);
  } catch (cause) {
    return failure(cause);
  }
}

/**
 * `POST /api/progress/lessons` with `{"lessonId": "..."}`: records that the signed-in learner
 * completed a lesson. Idempotent: 201 the first time, 200 with `alreadyCompleted` afterwards,
 * and XP is only ever awarded once. XP, type and course come from the content catalog.
 *
 * This is learner-reported progress: the server checks that the lesson exists, not that its
 * exercises were solved.
 */
export function recordLessonCompletion(request: Request, deps: ProgressApiDeps): Promise<Response> {
  return recordCompletionRequest("lesson", request, deps);
}

/**
 * `POST /api/progress/challenges` with `{"challengeId": "..."}`: the same for a standalone
 * challenge, with ownership and XP determined on the server.
 */
export function recordChallengeCompletion(
  request: Request,
  deps: ProgressApiDeps,
): Promise<Response> {
  return recordCompletionRequest("challenge", request, deps);
}
