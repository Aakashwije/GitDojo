import { type ProgressCatalog } from "@gitdojo/progress";
import { type LessonType } from "@gitdojo/shared-types";
import { type IdentityResult, type VerifiedIdentity } from "@/lib/auth/identity";

/**
 * The account progress domain's ports: the types and interfaces its use cases (`service.ts`)
 * depend on. Adapters implement them — PostgreSQL in `postgres-store.ts`, an in-memory store in
 * `testing.ts`, the identity provider and content catalog in `deps.ts` — so nothing here knows
 * about HTTP, SQL or the SDK.
 */

/** What can be completed and recorded to an account. */
export type CompletionKind = "lesson" | "challenge";

/** One lesson or challenge an account has completed, as stored. */
export interface StoredCompletion {
  /** Absent for lessons, which were the only kind before challenges were recorded. */
  kind?: "challenge";
  /** The lesson or challenge id. */
  lessonId: string;
  lessonType: LessonType;
  courseId: string | null;
  xp: number;
  /** The first completion. */
  completedAt: Date;
}

/** A completion to record. Everything here is computed by the server from the content catalog. */
export interface NewCompletion {
  kind?: "challenge";
  lessonId: string;
  lessonType: LessonType;
  courseId: string | null;
  xp: number;
}

/** One Git subcommand's usage, summed over the devices a read asked for. */
export interface StoredCommandStat {
  command: string;
  uses: number;
  successes: number;
  lastUsedAt: Date;
}

/** The last lesson visited, from whichever device visited one most recently. */
export interface StoredLastLesson {
  courseId: string;
  lessonId: string;
  visitedAt: Date;
}

/**
 * Everything besides completions. Counters exclude the device that asked, which keeps its own
 * copy: a device adds its own counters to these rather than double counting them.
 */
export interface StoredActivity {
  commandStats: StoredCommandStat[];
  playgroundSessions: number;
  /** Content key (`lesson:<id>`) → hints revealed on any device. */
  revealedHints: Record<string, string[]>;
  lastLesson: StoredLastLesson | null;
  /** Release version → when it was first seen on any device. */
  seenReleases: Record<string, Date>;
}

export interface AccountRecords {
  /** The internal user id. The browser uses it only to keep each account's cache separate. */
  accountId: string;
  completions: StoredCompletion[];
  activity: StoredActivity;
}

/**
 * One device's own progress, as it uploads it. Counters are absolute, never deltas, so the same
 * upload can be retried safely; hints, seen releases and the last lesson merge by union and
 * recency.
 */
export interface DeviceActivity {
  deviceId: string;
  commandStats: { command: string; uses: number; successes: number; lastUsedAt: Date }[];
  playgroundSessions: number;
  revealedHints: Record<string, string[]>;
  lastLesson: StoredLastLesson | null;
  seenReleases: Record<string, Date>;
}

export interface RecordResult {
  /** False when the content was already completed: nothing changed and no XP was added. */
  created: boolean;
  completion: StoredCompletion;
  /** Every completion of the account, after this one. */
  completions: StoredCompletion[];
}

/**
 * Account progress storage. Every call is scoped by a verified identity, never by an id from
 * the request, so one learner can never read or write another's records.
 */
export interface AccountProgressStore {
  /** Everything the account has. `deviceId` is excluded from the counter sums when given. */
  read(identity: VerifiedIdentity, deviceId?: string): Promise<AccountRecords>;
  /** Records a completion once; a repeat changes nothing and keeps the first timestamp and XP. */
  recordCompletion(identity: VerifiedIdentity, completion: NewCompletion): Promise<RecordResult>;
  /**
   * Merges one device's activity into the account and returns the account's view for that
   * device. Idempotent: the same upload twice leaves the same rows.
   */
  syncActivity(identity: VerifiedIdentity, activity: DeviceActivity): Promise<AccountRecords>;
}

/** Everything the account progress use cases depend on, injectable for tests. */
export interface ProgressApiDeps {
  verifyIdentity: () => Promise<IdentityResult>;
  /** Throws `DatabaseNotConfiguredError` without `DATABASE_URL`. */
  store: () => AccountProgressStore;
  catalog: () => Promise<ProgressCatalog>;
}
