import {
  isReleaseVersion,
  PROGRESS_SCHEMA_VERSION,
  type CommandStat,
  type CompletionRecord,
  type LocalProgress,
  type RemoteCounters,
} from "@gitdojo/progress";
import { type LessonType } from "@gitdojo/shared-types";

/** Lesson completions saved to the learner's account, keyed by lesson id. */
export type AccountLessons = Record<string, CompletionRecord>;

/** The account's progress beyond completions, as merged across its devices by the server. */
export interface AccountActivity {
  /** Counters from the account's **other** devices; this one adds its own. */
  counters: RemoteCounters;
  revealedHints: Record<string, string[]>;
  lastLesson?: { courseId: string; lessonId: string; visitedAt: number };
  /** Release version → when it was first seen on any of the account's devices. */
  seenReleases: Record<string, number>;
}

export const EMPTY_ACTIVITY: AccountActivity = {
  counters: { commandStats: {}, playgroundSessions: 0 },
  revealedHints: {},
  seenReleases: {},
};

export type AccountProgressResult =
  | {
      status: "ok";
      accountId: string;
      lessons: AccountLessons;
      challenges?: AccountLessons;
      activity: AccountActivity;
    }
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

interface ApiChallenge {
  challengeId?: unknown;
  xp?: unknown;
  completedAt?: unknown;
}

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

/** Mirrors the server's validation, so one malformed local entry cannot block a whole upload. */
const COMMAND = /^[a-z][a-z-]{0,31}$/;
const CONTENT_KEY = /^(?:lesson|challenge):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HINT = /^[a-z0-9]+(?:-[a-z0-9]+)*#\d{1,3}$/;
const COUNT_LIMIT = 10_000_000;
/** The banner only needs the current release; the server accepts up to 100. */
const SEEN_RELEASES_SENT = 50;
/** The server refuses timestamps before this, so a missing one falls back to the record's age. */
const EARLIEST = Date.UTC(2020, 0, 1);

function parseCounters(value: unknown): RemoteCounters {
  const counters: RemoteCounters = { commandStats: {}, playgroundSessions: 0 };
  if (typeof value !== "object" || value === null) return counters;
  const raw = value as { commandStats?: unknown; playgroundSessions?: unknown };
  if (typeof raw.playgroundSessions === "number" && Number.isInteger(raw.playgroundSessions)) {
    counters.playgroundSessions = Math.max(0, raw.playgroundSessions);
  }
  if (typeof raw.commandStats === "object" && raw.commandStats !== null) {
    for (const [command, entry] of Object.entries(raw.commandStats as Record<string, unknown>)) {
      if (!COMMAND.test(command) || typeof entry !== "object" || entry === null) continue;
      const stat = entry as { uses?: unknown; successes?: unknown; lastUsedAt?: unknown };
      const uses = typeof stat.uses === "number" ? Math.max(0, Math.trunc(stat.uses)) : 0;
      const successes =
        typeof stat.successes === "number" ? Math.max(0, Math.trunc(stat.successes)) : 0;
      const lastUsedAt =
        typeof stat.lastUsedAt === "string" ? Date.parse(stat.lastUsedAt) : Number.NaN;
      counters.commandStats[command] = {
        uses,
        successes: Math.min(successes, uses),
        lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : 0,
      };
    }
  }
  return counters;
}

function parseActivity(value: unknown): AccountActivity {
  if (typeof value !== "object" || value === null) return EMPTY_ACTIVITY;
  const raw = value as { revealedHints?: unknown; lastLesson?: unknown; seenReleases?: unknown };
  // The response carries the counters at the top level of `activity`.
  const activity: AccountActivity = {
    counters: parseCounters(value),
    revealedHints: {},
    seenReleases: {},
  };
  if (typeof raw.seenReleases === "object" && raw.seenReleases !== null) {
    for (const [version, seenAt] of Object.entries(raw.seenReleases as Record<string, unknown>)) {
      const time = typeof seenAt === "string" ? Date.parse(seenAt) : Number.NaN;
      if (isReleaseVersion(version) && Number.isFinite(time)) activity.seenReleases[version] = time;
    }
  }
  if (typeof raw.revealedHints === "object" && raw.revealedHints !== null) {
    for (const [key, hints] of Object.entries(raw.revealedHints as Record<string, unknown>)) {
      if (!CONTENT_KEY.test(key) || !Array.isArray(hints)) continue;
      const valid = hints.filter(
        (hint): hint is string => typeof hint === "string" && HINT.test(hint),
      );
      if (valid.length > 0) activity.revealedHints[key] = valid;
    }
  }
  const last = raw.lastLesson as
    { courseId?: unknown; lessonId?: unknown; visitedAt?: unknown } | null | undefined;
  if (last && typeof last.courseId === "string" && typeof last.lessonId === "string") {
    const visitedAt = typeof last.visitedAt === "string" ? Date.parse(last.visitedAt) : Number.NaN;
    if (Number.isFinite(visitedAt)) {
      activity.lastLesson = { courseId: last.courseId, lessonId: last.lessonId, visitedAt };
    }
  }
  return activity;
}

/**
 * This device's own progress, in the shape the sync endpoint takes. Counters are absolute, so
 * sending the same payload twice is a no-op on the server; anything malformed is left out rather
 * than risking the whole upload.
 */
export function deviceActivityPayload(progress: LocalProgress): Record<string, unknown> {
  const floor = Math.max(progress.createdAt, EARLIEST + 1);
  const commandStats: Record<string, { uses: number; successes: number; lastUsedAt: string }> = {};
  for (const [command, stat] of Object.entries(progress.commandStats)) {
    if (!COMMAND.test(command)) continue;
    const { uses, successes } = clampStat(stat);
    commandStats[command] = {
      uses,
      successes,
      lastUsedAt: new Date(Math.max(stat.lastUsedAt, floor)).toISOString(),
    };
  }
  const revealedHints: Record<string, string[]> = {};
  for (const [key, hints] of Object.entries(progress.revealedHints)) {
    if (!CONTENT_KEY.test(key)) continue;
    const valid = hints.filter((hint) => HINT.test(hint));
    if (valid.length > 0) revealedHints[key] = valid;
  }
  const seenReleases = Object.fromEntries(
    Object.entries(progress.seenReleases)
      .filter(([version]) => isReleaseVersion(version))
      .sort(([, a], [, b]) => b - a)
      .slice(0, SEEN_RELEASES_SENT)
      .map(([version, seenAt]) => [version, new Date(Math.max(seenAt, floor)).toISOString()]),
  );
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    deviceId: progress.deviceId,
    commandStats,
    playgroundSessions: Math.min(progress.playgroundSessions, COUNT_LIMIT),
    revealedHints,
    lastLesson: progress.lastLesson
      ? {
          courseId: progress.lastLesson.courseId,
          lessonId: progress.lastLesson.lessonId,
          visitedAt: new Date(Math.max(progress.lastLesson.visitedAt, floor)).toISOString(),
        }
      : null,
    seenReleases,
  };
}

function clampStat(stat: CommandStat): { uses: number; successes: number } {
  const uses = Math.min(Math.max(0, Math.trunc(stat.uses)), COUNT_LIMIT);
  return { uses, successes: Math.min(Math.max(0, Math.trunc(stat.successes)), uses) };
}

const REQUEST: RequestInit = { cache: "no-store", credentials: "same-origin" };

/** Reads the signed-in learner's account progress. Never throws. */
export async function fetchAccountProgress(
  fetcher: typeof fetch = fetch,
  deviceId?: string,
): Promise<AccountProgressResult> {
  try {
    const url =
      deviceId === undefined
        ? "/api/progress"
        : `/api/progress?device=${encodeURIComponent(deviceId)}`;
    const response = await fetcher(url, REQUEST);
    if (response.status === 401) return { status: "signed-out" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as {
      account?: { id?: unknown };
      completedLessons?: unknown;
      completedChallenges?: ApiChallenge[];
      activity?: unknown;
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
    const challenges: AccountLessons = {};
    for (const challenge of body.completedChallenges ?? []) {
      const entry = toRecord({ ...challenge, lessonId: challenge.challengeId, type: "challenge" });
      if (entry) challenges[entry[0]] = entry[1];
    }
    return { status: "ok", accountId, lessons, challenges, activity: parseActivity(body.activity) };
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
  kind: "lesson" | "challenge" = "lesson",
): Promise<LessonUploadResult> {
  try {
    const response = await fetcher(
      kind === "challenge" ? "/api/progress/challenges" : "/api/progress/lessons",
      {
        ...REQUEST,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "challenge" ? { challengeId: lessonId } : { lessonId }),
      },
    );
    if (response.status === 401) return { status: "signed-out" };
    if (response.status >= 500 || response.status === 429) return { status: "unavailable" };
    if (!response.ok) return { status: "rejected" };
    const body = (await response.json()) as { lesson?: ApiLesson; challenge?: ApiChallenge };
    const record =
      kind === "challenge" && body.challenge
        ? { ...body.challenge, lessonId: body.challenge.challengeId, type: "challenge" }
        : body.lesson;
    const entry = record ? toRecord(record) : null;
    return entry ? { status: "ok", lessonId: entry[0], record: entry[1] } : { status: "rejected" };
  } catch {
    return { status: "unavailable" };
  }
}

export type ActivitySyncResult =
  | { status: "ok"; accountId: string; activity: AccountActivity }
  | { status: "signed-out" }
  | { status: "unavailable" }
  /** The server refused this payload. Retrying it unchanged will not help. */
  | { status: "rejected"; code: string };

/**
 * Uploads this device's activity and adopts the account's merged view. Idempotent on the
 * server, so a retry after a network failure or a reload is always safe.
 */
export async function syncAccountActivity(
  progress: LocalProgress,
  fetcher: typeof fetch = fetch,
): Promise<ActivitySyncResult> {
  try {
    const response = await fetcher("/api/progress/sync", {
      ...REQUEST,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deviceActivityPayload(progress)),
    });
    if (response.status === 401) return { status: "signed-out" };
    if (response.status >= 500 || response.status === 429) return { status: "unavailable" };
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: unknown };
      } | null;
      const code = typeof body?.error?.code === "string" ? body.error.code : "rejected";
      return { status: "rejected", code };
    }
    const body = (await response.json()) as { account?: { id?: unknown }; activity?: unknown };
    const accountId = body.account?.id;
    if (typeof accountId !== "string") return { status: "unavailable" };
    return { status: "ok", accountId, activity: parseActivity(body.activity) };
  } catch {
    return { status: "unavailable" };
  }
}
