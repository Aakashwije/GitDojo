import { completionXp, indexLessons, type ProgressCatalog } from "@gitdojo/progress";
import { type VerifiedIdentity } from "@/lib/auth/identity";
import {
  type CompletionKind,
  type DeviceActivity,
  type NewCompletion,
  type ProgressApiDeps,
  type RecordResult,
  type StoredActivity,
  type StoredCompletion,
} from "./ports";

/**
 * Account progress use cases. They depend only on the ports in `ports.ts`, never on HTTP, SQL or
 * the identity SDK: `api.ts` adapts them to requests and responses.
 */

/** A dependency failed; `step` names which, for logs. The cause is kept for error mapping. */
export class ProgressStepError extends Error {
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

/**
 * How each kind of content becomes a completion. The XP, type and course always come from the
 * content catalog, never from the request. Adding a completable kind starts here.
 */
const COMPLETION_KINDS: Record<
  CompletionKind,
  (catalog: ProgressCatalog, id: string) => NewCompletion | null
> = {
  lesson: (catalog, id) => {
    const lesson = indexLessons(catalog).get(id);
    if (!lesson) return null;
    return {
      lessonId: lesson.id,
      lessonType: lesson.type,
      courseId: lesson.course?.id ?? null,
      xp: completionXp({ kind: "lesson", id: lesson.id, type: lesson.type }),
    };
  },
  challenge: (catalog, id) => {
    const challenge = catalog.challenges.find((item) => item.id === id);
    if (!challenge) return null;
    return {
      kind: "challenge",
      lessonId: challenge.id,
      lessonType: "challenge",
      courseId: null,
      xp: completionXp({ kind: "challenge", id: challenge.id }),
    };
  },
};

export const sumXp = (completions: readonly StoredCompletion[]) =>
  completions.reduce((sum, completion) => sum + completion.xp, 0);

export interface AccountProgress {
  accountId: string;
  completions: StoredCompletion[];
  activity: StoredActivity;
  catalog: ProgressCatalog;
  totalXp: number;
}

/**
 * The learner's whole account progress with the current catalog, read in parallel. `deviceId`,
 * when given, is left out of the counter sums: that device adds its own.
 */
export async function readAccountProgress(
  deps: ProgressApiDeps,
  identity: VerifiedIdentity,
  deviceId?: string,
): Promise<AccountProgress> {
  const [{ accountId, completions, activity }, catalog] = await Promise.all([
    progressStep("database", () => deps.store().read(identity, deviceId)),
    progressStep("catalog", () => deps.catalog()),
  ]);
  return { accountId, completions, activity, catalog, totalXp: sumXp(completions) };
}

/**
 * Merges one device's activity into the account and returns the account's view for it.
 * Idempotent, so a retry after a network failure writes the same rows and changes nothing.
 */
export async function syncDeviceActivity(
  deps: ProgressApiDeps,
  identity: VerifiedIdentity,
  activity: DeviceActivity,
): Promise<AccountProgress> {
  const [records, catalog] = await Promise.all([
    progressStep("database", () => deps.store().syncActivity(identity, activity)),
    progressStep("catalog", () => deps.catalog()),
  ]);
  return { ...records, catalog, totalXp: sumXp(records.completions) };
}

export type RecordOutcome =
  /** No content of that kind has this id. Nothing was written. */
  | { status: "unknown" }
  | ({ status: "recorded"; catalog: ProgressCatalog; totalXp: number } & RecordResult);

/**
 * Records that the learner completed a lesson or challenge. Idempotent: XP is only ever awarded
 * once. This is learner-reported progress: the content must exist, but its exercises are not
 * re-checked here.
 */
export async function recordCompletion(
  deps: ProgressApiDeps,
  identity: VerifiedIdentity,
  kind: CompletionKind,
  id: string,
): Promise<RecordOutcome> {
  const catalog = await progressStep("catalog", () => deps.catalog());
  const completion = COMPLETION_KINDS[kind](catalog, id);
  if (!completion) return { status: "unknown" };
  const result = await progressStep("database", () =>
    deps.store().recordCompletion(identity, completion),
  );
  return { status: "recorded", catalog, totalXp: sumXp(result.completions), ...result };
}
