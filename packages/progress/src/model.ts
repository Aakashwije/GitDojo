import { type LessonType } from "@gitdojo/shared-types";

/**
 * Bumped whenever the stored shape changes; {@link parseProgress} upgrades older records.
 *
 * - 1: the original shape.
 * - 2: adds {@link LocalProgress.remoteCounters} and `syncedAt` for account sync across devices.
 *   A version 1 record upgrades by simply having neither, which is also the correct starting
 *   point: nothing has been synced yet.
 * - 3: adds {@link LocalProgress.seenReleases}. A version 2 record upgrades with none seen. The
 *   bump matters for tabs still running the previous version: they refuse a newer record rather
 *   than rewriting it without the field, so a dismissed announcement cannot come back.
 */
export const PROGRESS_SCHEMA_VERSION = 3;

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

/**
 * Counters this account has recorded on **other** devices, as of the last successful sync.
 *
 * Counters are the only progress that cannot simply be unioned: adding two devices' command
 * counts is right, adding a device's own counts to themselves is not. So a device's own
 * `commandStats` and `playgroundSessions` stay its own, the server keeps one row per device, and
 * the total a learner sees is this device's plus these. That makes an upload idempotent — a
 * device always sends its absolute counters, never a delta — and a retry after a network failure
 * can never double count. Use {@link withRemoteCounters} to read the combined view.
 */
export interface RemoteCounters {
  commandStats: Record<string, CommandStat>;
  playgroundSessions: number;
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
  /** Git subcommand (`commit`, `cherry-pick`) → uses and successes, **on this device**. */
  commandStats: Record<string, CommandStat>;
  /**
   * Content key (`lesson:<id>` or `challenge:<id>`) → hints revealed there, as
   * `<objective id>#<hint index>`. Each hint counts once, however often it is shown again.
   */
  revealedHints: Record<string, string[]>;
  /** The hands-on or concept lesson the learner opened most recently. */
  lastLesson?: { courseId: string; lessonId: string; visitedAt: number };
  /** Playground sessions **on this device**. */
  playgroundSessions: number;
  /** The same counters from the account's other devices; absent until a sync has succeeded. */
  remoteCounters?: RemoteCounters;
  /** When this device's progress last reached the account, if ever. */
  syncedAt?: number;
  /**
   * Release version (`v0.1.12`) → when the learner first opened its "What's new" page or dismissed
   * its announcement. Not learning progress: a reset keeps it.
   */
  seenReleases: Record<string, number>;
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

/** A published GitDojo release tag, such as `v0.1.12`. */
export const RELEASE_VERSION = /^v\d{1,4}\.\d{1,4}\.\d{1,6}$/;

export function isReleaseVersion(value: unknown): value is string {
  return typeof value === "string" && RELEASE_VERSION.test(value);
}

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
    seenReleases: {},
    migrations: {},
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };
}

/** Adds one device's counters to another's. Used for both merging and display. */
function addStats(
  own: Record<string, CommandStat>,
  other: Record<string, CommandStat>,
): Record<string, CommandStat> {
  const combined: Record<string, CommandStat> = { ...own };
  for (const [command, stat] of Object.entries(other)) {
    const mine = combined[command];
    combined[command] = mine
      ? {
          uses: mine.uses + stat.uses,
          successes: mine.successes + stat.successes,
          lastUsedAt: Math.max(mine.lastUsedAt, stat.lastUsedAt),
        }
      : stat;
  }
  return combined;
}

/**
 * Progress as the learner should see it: this device's counters plus the account's other
 * devices'. Everything else (completions, hints, the last lesson) is already merged in place, so
 * it is returned unchanged. Without a sync this is the record itself.
 */
export function withRemoteCounters(progress: LocalProgress): LocalProgress {
  const remote = progress.remoteCounters;
  if (!remote) return progress;
  return {
    ...progress,
    commandStats: addStats(progress.commandStats, remote.commandStats),
    playgroundSessions: progress.playgroundSessions + remote.playgroundSessions,
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
