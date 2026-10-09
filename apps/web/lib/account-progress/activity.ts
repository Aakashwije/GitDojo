import { type DeviceActivity, type StoredActivity } from "./ports";

/**
 * Validation for the activity a device uploads. Nothing here trusts the request: every field is
 * checked for type, shape, range and size before it reaches SQL, and anything the server does
 * not recognise is refused rather than stored or quietly dropped.
 *
 * XP and completions are deliberately not part of this payload — they stay on the completion
 * endpoints, where the server computes XP from the content catalog.
 */

/** Schema versions of `@gitdojo/progress` this server understands. */
export const SUPPORTED_SYNC_VERSIONS: readonly number[] = [1, 2];

/** Generous but finite: a learner with years of history stays well inside these. */
export const SYNC_LIMITS = {
  bodyBytes: 64 * 1024,
  deviceIdLength: 100,
  commands: 64,
  hintContentKeys: 500,
  hintsPerContentKey: 200,
  /** Counters are small; anything larger is a broken or hostile client. */
  count: 10_000_000,
} as const;

const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const COMMAND = /^[a-z][a-z-]{0,31}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTENT_KEY = /^(?:lesson|challenge):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HINT = /^[a-z0-9]+(?:-[a-z0-9]+)*#\d{1,3}$/;
const MAX_SLUG = 100;

/** Timestamps before GitDojo existed, or far in the future, are a broken clock, not progress. */
const EARLIEST = Date.UTC(2020, 0, 1);
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export type ActivityParse =
  { ok: true; activity: DeviceActivity } | { ok: false; code: string; message: string };

function reject(code: string, message: string): ActivityParse {
  return { ok: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= SYNC_LIMITS.count
    ? value
    : null;
}

function timestamp(value: unknown, now: number): Date | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < EARLIEST || parsed > now + FUTURE_TOLERANCE_MS) return null;
  return new Date(parsed);
}

function slug(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_SLUG && SLUG.test(value) ? value : null;
}

const FIELDS = new Set([
  "schemaVersion",
  "deviceId",
  "commandStats",
  "playgroundSessions",
  "revealedHints",
  "lastLesson",
]);

/**
 * Turns a request body into a {@link DeviceActivity}, or says why it cannot. Every field is
 * optional except the device id: a device that has only visited a lesson sends only that.
 */
export function parseDeviceActivity(body: unknown, now: number): ActivityParse {
  if (!isRecord(body))
    return reject("invalid_body", "Send a JSON object with this device's progress.");

  const unexpected = Object.keys(body).filter((key) => !FIELDS.has(key));
  if (unexpected.length > 0) {
    return reject(
      "unexpected_fields",
      `Unknown fields are not stored (got: ${unexpected.slice(0, 5).join(", ")}). XP and completions are recorded by their own endpoints.`,
    );
  }

  // A newer client may carry fields this server would drop, so refuse the whole upload rather
  // than store half of it. The client keeps its progress and retries after the next deploy.
  const version = body.schemaVersion;
  if (typeof version !== "number" || !SUPPORTED_SYNC_VERSIONS.includes(version)) {
    return reject(
      "unsupported_schema_version",
      `This server supports progress schema ${SUPPORTED_SYNC_VERSIONS.join(", ")}. Nothing was changed.`,
    );
  }

  const deviceId = body.deviceId;
  if (typeof deviceId !== "string" || !DEVICE_ID.test(deviceId)) {
    return reject("invalid_device_id", "deviceId must be a short opaque identifier.");
  }

  const commandStats: DeviceActivity["commandStats"] = [];
  if (body.commandStats !== undefined) {
    if (!isRecord(body.commandStats))
      return reject("invalid_command_stats", "commandStats must be an object.");
    const entries = Object.entries(body.commandStats);
    if (entries.length > SYNC_LIMITS.commands) {
      return reject("invalid_command_stats", "Too many commands in one upload.");
    }
    for (const [command, raw] of entries) {
      if (!COMMAND.test(command)) {
        return reject(
          "invalid_command_stats",
          `"${command.slice(0, 32)}" is not a Git subcommand.`,
        );
      }
      if (!isRecord(raw))
        return reject("invalid_command_stats", `commandStats.${command} must be an object.`);
      const uses = count(raw.uses);
      const successes = count(raw.successes);
      const lastUsedAt = timestamp(raw.lastUsedAt, now);
      if (uses === null || successes === null || successes > uses || lastUsedAt === null) {
        return reject("invalid_command_stats", `commandStats.${command} is out of range.`);
      }
      commandStats.push({ command, uses, successes, lastUsedAt });
    }
  }

  const playgroundSessions =
    body.playgroundSessions === undefined ? 0 : count(body.playgroundSessions);
  if (playgroundSessions === null) {
    return reject("invalid_playground_sessions", "playgroundSessions must be a count.");
  }

  const revealedHints: Record<string, string[]> = {};
  if (body.revealedHints !== undefined) {
    if (!isRecord(body.revealedHints))
      return reject("invalid_hints", "revealedHints must be an object.");
    const entries = Object.entries(body.revealedHints);
    if (entries.length > SYNC_LIMITS.hintContentKeys) {
      return reject("invalid_hints", "Too many lessons in one upload.");
    }
    for (const [contentKey, list] of entries) {
      if (!CONTENT_KEY.test(contentKey) || contentKey.length > MAX_SLUG + 10) {
        return reject("invalid_hints", `"${contentKey.slice(0, 40)}" is not a content key.`);
      }
      if (!Array.isArray(list) || list.length > SYNC_LIMITS.hintsPerContentKey) {
        return reject("invalid_hints", `revealedHints.${contentKey} must be a short array.`);
      }
      const hints = [...new Set(list)];
      for (const hint of hints) {
        if (typeof hint !== "string" || !HINT.test(hint)) {
          return reject("invalid_hints", `revealedHints.${contentKey} has an invalid hint.`);
        }
      }
      if (hints.length > 0) revealedHints[contentKey] = hints as string[];
    }
  }

  let lastLesson: DeviceActivity["lastLesson"] = null;
  if (body.lastLesson !== undefined && body.lastLesson !== null) {
    if (!isRecord(body.lastLesson))
      return reject("invalid_last_lesson", "lastLesson must be an object.");
    const courseId = slug(body.lastLesson.courseId);
    const lessonId = slug(body.lastLesson.lessonId);
    const visitedAt = timestamp(body.lastLesson.visitedAt, now);
    if (courseId === null || lessonId === null || visitedAt === null) {
      return reject(
        "invalid_last_lesson",
        "lastLesson needs a course id, a lesson id and a visit time.",
      );
    }
    lastLesson = { courseId, lessonId, visitedAt };
  }

  return {
    ok: true,
    activity: { deviceId, commandStats, playgroundSessions, revealedHints, lastLesson },
  };
}

/** The account's merged activity, as the API returns it. */
export interface ActivityResponse {
  commandStats: Record<string, { uses: number; successes: number; lastUsedAt: string }>;
  playgroundSessions: number;
  revealedHints: Record<string, string[]>;
  lastLesson: { courseId: string; lessonId: string; visitedAt: string } | null;
}

/**
 * Presents the account's activity. Counters here are every **other** device's, so the browser
 * adds its own rather than counting them twice.
 */
export function presentActivity(activity: StoredActivity): ActivityResponse {
  const commandStats: ActivityResponse["commandStats"] = {};
  for (const stat of activity.commandStats) {
    commandStats[stat.command] = {
      uses: stat.uses,
      successes: stat.successes,
      lastUsedAt: stat.lastUsedAt.toISOString(),
    };
  }
  return {
    commandStats,
    playgroundSessions: activity.playgroundSessions,
    revealedHints: activity.revealedHints,
    lastLesson: activity.lastLesson
      ? { ...activity.lastLesson, visitedAt: activity.lastLesson.visitedAt.toISOString() }
      : null,
  };
}
