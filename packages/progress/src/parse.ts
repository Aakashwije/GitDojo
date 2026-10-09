import { type LessonType } from "@gitdojo/shared-types";
import {
  ANONYMOUS,
  emptyProgress,
  PROGRESS_SCHEMA_VERSION,
  totalXp,
  type CommandStat,
  type CompletionRecord,
  type LocalProgress,
  type ProgressOwner,
  type RemoteCounters,
} from "./model";

/** Stored progress written by a newer GitDojo. It is left untouched rather than downgraded. */
export class NewerProgressVersionError extends Error {
  constructor(readonly version: number) {
    super(`Progress was saved by a newer version of GitDojo (schema ${String(version)}).`);
    this.name = "NewerProgressVersionError";
  }
}

export interface ParsedProgress {
  progress: LocalProgress;
  /** What had to be dropped or repaired; empty for a well-formed record. */
  issues: string[];
}

type UnknownRecord = Record<string, unknown>;

const LESSON_TYPES = new Set<string>(["concept", "interactive", "challenge"]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseOwner(value: unknown): ProgressOwner | null {
  if (!isRecord(value)) return null;
  if (value.kind === "anonymous") return ANONYMOUS;
  if (value.kind === "account" && typeof value.accountId === "string" && value.accountId !== "") {
    return { kind: "account", accountId: value.accountId };
  }
  return null;
}

function parseCompletion(value: unknown): CompletionRecord | null {
  if (!isRecord(value) || !isTimestamp(value.completedAt) || !isCount(value.xp)) return null;
  return {
    completedAt: value.completedAt,
    xp: value.xp,
    ...(typeof value.type === "string" && LESSON_TYPES.has(value.type)
      ? { type: value.type as LessonType }
      : {}),
    ...(typeof value.courseId === "string" ? { courseId: value.courseId } : {}),
    ...(value.migrated === true ? { migrated: true as const } : {}),
  };
}

function parseMap<T>(
  value: unknown,
  field: string,
  parseEntry: (entry: unknown) => T | null,
  issues: string[],
): Record<string, T> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(`${field} was not an object`);
    return {};
  }
  const result: Record<string, T> = {};
  for (const [key, entry] of Object.entries(value)) {
    const parsed = key === "" ? null : parseEntry(entry);
    if (parsed === null) issues.push(`${field}.${key} was invalid`);
    else result[key] = parsed;
  }
  return result;
}

function parseCommandStat(value: unknown): CommandStat | null {
  if (!isRecord(value) || !isCount(value.uses) || !isCount(value.successes)) return null;
  return {
    uses: value.uses,
    // Successes can never exceed uses.
    successes: Math.min(value.successes, value.uses),
    lastUsedAt: isTimestamp(value.lastUsedAt) ? value.lastUsedAt : 0,
  };
}

function parseHints(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((hint): hint is string => typeof hint === "string"))];
}

/**
 * Reads stored (or imported) progress without trusting it: anything malformed is dropped field by
 * field, so one bad entry never costs the learner the rest of their progress. XP is always
 * recomputed from the completion records. Throws {@link NewerProgressVersionError} for data from
 * a newer schema, which must not be overwritten.
 */
export function parseProgress(raw: unknown, now: number): ParsedProgress {
  const issues: string[] = [];
  if (!isRecord(raw)) {
    return {
      progress: emptyProgress(now),
      issues: raw === undefined ? [] : ["stored progress was not an object"],
    };
  }

  const version = raw.schemaVersion;
  if (typeof version === "number" && version > PROGRESS_SCHEMA_VERSION) {
    throw new NewerProgressVersionError(version);
  }
  // A version 1 record upgrades in place: it simply has no synced counters yet, which is also
  // what a fresh version 2 record looks like. Nothing is dropped and nothing is re-counted.
  if (typeof version !== "number" || version < 1 || version > PROGRESS_SCHEMA_VERSION) {
    issues.push("schemaVersion was missing or invalid");
  }

  const owner = parseOwner(raw.owner);
  if (owner === null) issues.push("owner was invalid");
  const base = emptyProgress(now, {
    owner: owner ?? ANONYMOUS,
    ...(typeof raw.deviceId === "string" && raw.deviceId !== "" ? { deviceId: raw.deviceId } : {}),
  });

  const completedLessons = parseMap(
    raw.completedLessons,
    "completedLessons",
    parseCompletion,
    issues,
  );
  const completedChallenges = parseMap(
    raw.completedChallenges,
    "completedChallenges",
    parseCompletion,
    issues,
  );
  const commandStats = parseMap(raw.commandStats, "commandStats", parseCommandStat, issues);
  const revealedHints = parseMap(raw.revealedHints, "revealedHints", parseHints, issues);
  const migrations = parseMap(
    raw.migrations,
    "migrations",
    (entry) => (isTimestamp(entry) ? entry : null),
    issues,
  );

  let remoteCounters: RemoteCounters | undefined;
  if (raw.remoteCounters !== undefined) {
    if (isRecord(raw.remoteCounters)) {
      remoteCounters = {
        commandStats: parseMap(
          raw.remoteCounters.commandStats,
          "remoteCounters.commandStats",
          parseCommandStat,
          issues,
        ),
        playgroundSessions: isCount(raw.remoteCounters.playgroundSessions)
          ? raw.remoteCounters.playgroundSessions
          : 0,
      };
    } else {
      issues.push("remoteCounters was not an object");
    }
  }

  let lastLesson: LocalProgress["lastLesson"];
  if (raw.lastLesson !== undefined) {
    const last = raw.lastLesson;
    if (
      isRecord(last) &&
      typeof last.courseId === "string" &&
      typeof last.lessonId === "string" &&
      isTimestamp(last.visitedAt)
    ) {
      lastLesson = { courseId: last.courseId, lessonId: last.lessonId, visitedAt: last.visitedAt };
    } else {
      issues.push("lastLesson was invalid");
    }
  }

  const progress: LocalProgress = {
    ...base,
    completedLessons,
    completedChallenges,
    xp: totalXp({ completedLessons, completedChallenges }),
    commandStats,
    revealedHints,
    playgroundSessions: isCount(raw.playgroundSessions) ? raw.playgroundSessions : 0,
    migrations,
    createdAt: isTimestamp(raw.createdAt) ? raw.createdAt : now,
    updatedAt: isTimestamp(raw.updatedAt) ? raw.updatedAt : now,
    revision: isCount(raw.revision) ? raw.revision : 0,
    ...(lastLesson ? { lastLesson } : {}),
    ...(remoteCounters ? { remoteCounters } : {}),
    ...(isTimestamp(raw.syncedAt) ? { syncedAt: raw.syncedAt } : {}),
    ...(isTimestamp(raw.resetAt) ? { resetAt: raw.resetAt } : {}),
  };
  if (raw.xp !== progress.xp && raw.xp !== undefined) issues.push("xp did not match completions");
  return { progress, issues };
}
