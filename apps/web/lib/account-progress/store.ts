import { type LessonType } from "@gitdojo/shared-types";
import type postgres from "postgres";
import { type VerifiedIdentity } from "@/lib/auth/identity";

/** One lesson an account has completed, as stored. */
export interface StoredCompletion {
  lessonId: string;
  lessonType: LessonType;
  courseId: string | null;
  xp: number;
  /** The first completion. */
  completedAt: Date;
}

/** A completion to record. Everything here is computed by the server from the content catalog. */
export interface NewCompletion {
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
  /** False when the lesson was already completed: nothing changed and no XP was added. */
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
  recordLesson(identity: VerifiedIdentity, completion: NewCompletion): Promise<RecordResult>;
}

type Queryable = postgres.Sql | postgres.TransactionSql;

interface CompletionRow {
  lesson_id: string;
  lesson_type: LessonType;
  course_id: string | null;
  xp: number;
  completed_at: Date;
}

const toCompletion = (row: CompletionRow): StoredCompletion => ({
  lessonId: row.lesson_id,
  lessonType: row.lesson_type,
  courseId: row.course_id,
  xp: row.xp,
  completedAt: row.completed_at,
});

/**
 * The account's internal id, creating the user on first access and refreshing the profile when
 * it changed. Safe under concurrency: the unique (issuer, subject) constraint decides, and a
 * request that loses the race reads the winner's row.
 */
export async function upsertUser(sql: Queryable, identity: VerifiedIdentity): Promise<string> {
  const [inserted] = await sql<{ id: string }[]>`
    INSERT INTO users (issuer, subject, name, email)
    VALUES (${identity.issuer}, ${identity.subject}, ${identity.name}, ${identity.email})
    ON CONFLICT (issuer, subject) DO UPDATE
      SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = now()
      WHERE users.name IS DISTINCT FROM EXCLUDED.name
         OR users.email IS DISTINCT FROM EXCLUDED.email
    RETURNING id
  `;
  if (inserted) return inserted.id;
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE issuer = ${identity.issuer} AND subject = ${identity.subject}
  `;
  if (!existing) throw new Error("user upsert returned no row");
  return existing.id;
}

export async function listCompletions(sql: Queryable, userId: string): Promise<StoredCompletion[]> {
  const rows = await sql<CompletionRow[]>`
    SELECT lesson_id, lesson_type, course_id, xp, completed_at
    FROM lesson_completions
    WHERE user_id = ${userId}
    ORDER BY completed_at, lesson_id
  `;
  return rows.map(toCompletion);
}

/**
 * Records a completion once. A repeat, a retry or a concurrent duplicate hits the primary key
 * (user, lesson) and changes nothing, so the first timestamp and XP are kept.
 */
export async function insertCompletion(
  sql: Queryable,
  userId: string,
  completion: NewCompletion,
): Promise<{ created: boolean; completion: StoredCompletion }> {
  const [inserted] = await sql<CompletionRow[]>`
    INSERT INTO lesson_completions (user_id, lesson_id, lesson_type, course_id, xp)
    VALUES (
      ${userId}, ${completion.lessonId}, ${completion.lessonType},
      ${completion.courseId}, ${completion.xp}
    )
    ON CONFLICT (user_id, lesson_id) DO NOTHING
    RETURNING lesson_id, lesson_type, course_id, xp, completed_at
  `;
  if (inserted) return { created: true, completion: toCompletion(inserted) };
  const [existing] = await sql<CompletionRow[]>`
    SELECT lesson_id, lesson_type, course_id, xp, completed_at
    FROM lesson_completions
    WHERE user_id = ${userId} AND lesson_id = ${completion.lessonId}
  `;
  if (!existing) throw new Error("completion insert returned no row");
  return { created: false, completion: toCompletion(existing) };
}

export function createPostgresProgressStore(sql: postgres.Sql): AccountProgressStore {
  return {
    async read(identity) {
      return sql.begin(async (tx) => {
        const accountId = await upsertUser(tx, identity);
        return { accountId, completions: await listCompletions(tx, accountId) };
      });
    },
    async recordLesson(identity, completion) {
      return sql.begin(async (tx) => {
        const userId = await upsertUser(tx, identity);
        const result = await insertCompletion(tx, userId, completion);
        return { ...result, completions: await listCompletions(tx, userId) };
      });
    },
  };
}
