import { indexLessons, type ProgressCatalog } from "./catalog";
import { totalXp, XP_REWARDS, type CompletionRecord, type LocalProgress } from "./model";

/** Where course progress lived before this package: a Zustand `persist` entry in localStorage. */
export const LEGACY_STORAGE_KEY = "gitdojo:course-progress";

/** Name recorded in `LocalProgress.migrations` once the legacy data has been imported. */
export const LEGACY_MIGRATION = "localstorage-course-progress";

export interface LegacyProgress {
  completedLessons: string[];
  completedChallenges: string[];
}

/** Synchronous key-value storage holding the legacy entry (localStorage in browsers). */
export interface LegacyStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

function completedIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string" && id !== "");
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .filter(([id, done]) => id !== "" && done === true)
      .map(([id]) => id);
  }
  return [];
}

/**
 * Parses the legacy entry: `{ state: { completedLessons: { <id>: true }, completedChallenges },
 * version }` (version 1 had no challenges). Returns `null` when there is nothing usable.
 */
export function parseLegacyProgress(raw: string | null): LegacyProgress | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const state = (data as { state?: unknown }).state;
  if (typeof state !== "object" || state === null) return null;
  const { completedLessons, completedChallenges } = state as Record<string, unknown>;
  const legacy = {
    completedLessons: completedIds(completedLessons),
    completedChallenges: completedIds(completedChallenges),
  };
  return legacy.completedLessons.length + legacy.completedChallenges.length > 0 ? legacy : null;
}

/**
 * Imports legacy completions. Rules:
 * - Runs at most once per record (tracked in `migrations`); afterwards, even a reset never brings
 *   the old data back.
 * - Existing completions are kept unchanged; legacy ids only fill gaps, so no XP is awarded twice.
 * - A migrated completion earns the XP its content type earns today, timestamped with the
 *   migration time (the original time was never saved). Lessons that no longer exist are kept
 *   with 0 XP, so the completion is not lost but cannot inflate XP.
 */
export function migrateLegacyProgress(
  progress: LocalProgress,
  legacy: LegacyProgress | null,
  catalog: ProgressCatalog,
  now: number,
): LocalProgress {
  if (progress.migrations[LEGACY_MIGRATION] !== undefined) return progress;
  const migrations = { ...progress.migrations, [LEGACY_MIGRATION]: now };
  if (legacy === null) return { ...progress, migrations };

  const lessons = indexLessons(catalog);
  const challengeIds = new Set(catalog.challenges.map((challenge) => challenge.id));
  const completedLessons = { ...progress.completedLessons };
  const completedChallenges = { ...progress.completedChallenges };

  for (const id of legacy.completedLessons) {
    if (completedLessons[id]) continue;
    const lesson = lessons.get(id);
    const record: CompletionRecord = {
      completedAt: now,
      xp: lesson ? XP_REWARDS[lesson.type] : 0,
      migrated: true,
      ...(lesson ? { type: lesson.type } : {}),
      ...(lesson?.course ? { courseId: lesson.course.id } : {}),
    };
    completedLessons[id] = record;
  }
  for (const id of legacy.completedChallenges) {
    if (completedChallenges[id]) continue;
    const known = challengeIds.has(id);
    completedChallenges[id] = {
      completedAt: now,
      xp: known ? XP_REWARDS.challenge : 0,
      migrated: true,
      ...(known ? { type: "challenge" as const } : {}),
    };
  }

  return {
    ...progress,
    completedLessons,
    completedChallenges,
    xp: totalXp({ completedLessons, completedChallenges }),
    migrations,
    updatedAt: now,
    revision: progress.revision + 1,
  };
}
