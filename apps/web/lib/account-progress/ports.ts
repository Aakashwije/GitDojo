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

export interface AccountRecords {
  /** The internal user id. The browser uses it only to keep each account's cache separate. */
  accountId: string;
  completions: StoredCompletion[];
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
  read(identity: VerifiedIdentity): Promise<AccountRecords>;
  /** Records a completion once; a repeat changes nothing and keeps the first timestamp and XP. */
  recordCompletion(identity: VerifiedIdentity, completion: NewCompletion): Promise<RecordResult>;
}

/** Everything the account progress use cases depend on, injectable for tests. */
export interface ProgressApiDeps {
  verifyIdentity: () => Promise<IdentityResult>;
  /** Throws `DatabaseNotConfiguredError` without `DATABASE_URL`. */
  store: () => AccountProgressStore;
  catalog: () => Promise<ProgressCatalog>;
}
