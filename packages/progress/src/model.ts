import { type LessonType } from "@gitdojo/shared-types";

/** Bumped whenever the stored shape changes; {@link parseProgress} upgrades older records. */
export const PROGRESS_SCHEMA_VERSION = 1;

/**
 * Whose progress a record holds. Only anonymous progress exists today; signed-in accounts
 * (WSO2 Identity Platform) will get their own records instead of overwriting this one, so
 * anonymous progress can later be offered for import rather than silently merged.
 */
export type ProgressOwner = { kind: "anonymous" } | { kind: "account"; accountId: string };

export const ANONYMOUS: ProgressOwner = { kind: "anonymous" };

/** Storage key for an owner's record. Never contains tokens or other credentials. */
export function ownerKey(owner: ProgressOwner): string {
  return owner.kind === "anonymous" ? "anonymous" : `account:${owner.accountId}`;
}

/** One finished lesson or challenge. Written once; replays never change it. */
export interface CompletionRecord {
  /** First completion, ms since the epoch. Migrated records use the migration time. */
  completedAt: number;
  /** XP awarded for this completion; the total is always the sum of these. */
  xp: number;
  /** The lesson type when it was completed; missing when migrated content no longer exists. */
  type?: LessonType;
  /** The course the lesson was completed in, if any. */
  courseId?: string;
  /** Imported from the localStorage progress used before this package existed. */
  migrated?: true;
}

export interface CommandStat {
  /** Submitted lines running this Git command (`git commit`), successful or not. */
  uses: number;
  /** Uses where the command itself succeeded. */
  successes: number;
  lastUsedAt: number;
}

/** A learner's local progress, as stored in IndexedDB and exported as JSON. */
export interface LocalProgress {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  owner: ProgressOwner;
  /**
   * Random per-browser id. Counters (command stats, hints, playground sessions) are per device,
   * so a future sync can merge them per device instead of double counting.
   */
  deviceId: string;
  /** Lesson id → completion. Lesson ids are unique across courses. */
  completedLessons: Record<string, CompletionRecord>;
  /** Standalone challenge id → completion. Challenge ids are a separate namespace. */
  completedChallenges: Record<string, CompletionRecord>;
  /** Sum of every completion's `xp`; recomputed from the records whenever data is loaded. */
  xp: number;
  /** Git subcommand (`commit`, `cherry-pick`) → uses and successes. */
  commandStats: Record<string, CommandStat>;
  /**
   * Content key (`lesson:<id>` or `challenge:<id>`) → hints revealed there, as
   * `<objective id>#<hint index>`. Each hint counts once, however often it is shown again.
   */
  revealedHints: Record<string, string[]>;
  /** The hands-on or concept lesson the learner opened most recently. */
  lastLesson?: { courseId: string; lessonId: string; visitedAt: number };
  playgroundSessions: number;
  /** One-off data migrations already applied (name → when), so none runs twice. */
  migrations: Record<string, number>;
  createdAt: number;
  updatedAt: number;
  /** Incremented on every saved change. */
  revision: number;
  /** When learning progress was last reset, if ever. */
  resetAt?: number;
}

/** Completion XP by lesson type. Standalone challenges earn the `challenge` amount. */
export const XP_REWARDS: Readonly<Record<LessonType, number>> = {
  concept: 25,
  interactive: 50,
  challenge: 100,
};

/** What finishing a piece of content is worth. */
export function completionXp(content: ContentRef): number {
  return XP_REWARDS[content.kind === "challenge" ? "challenge" : content.type];
}

/**
 * A completable piece of content. A course's challenge lesson is a `lesson` (of type
 * `challenge`); only the standalone challenges under /challenges are `challenge`s, so the same
 * work is never rewarded under both.
 */
export type ContentRef =
  | { kind: "lesson"; id: string; type: LessonType; courseId?: string }
  | { kind: "challenge"; id: string };

/** Lessons and challenges may share ids (`first-commit`), so keys carry the kind. */
export function contentKey(content: Pick<ContentRef, "kind" | "id">): string {
  return `${content.kind}:${content.id}`;
}

function randomId(): string {
  const crypto = globalThis.crypto as Crypto | undefined;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `device-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function emptyProgress(
  now: number,
  { owner = ANONYMOUS, deviceId = randomId() }: { owner?: ProgressOwner; deviceId?: string } = {},
): LocalProgress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    owner,
    deviceId,
    completedLessons: {},
    completedChallenges: {},
    xp: 0,
    commandStats: {},
    revealedHints: {},
    playgroundSessions: 0,
    migrations: {},
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };
}

export function totalXp(
  progress: Pick<LocalProgress, "completedLessons" | "completedChallenges">,
): number {
  let sum = 0;
  for (const record of Object.values(progress.completedLessons)) sum += record.xp;
  for (const record of Object.values(progress.completedChallenges)) sum += record.xp;
  return sum;
}
