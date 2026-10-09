import { type LessonType } from "@gitdojo/shared-types";
import type postgres from "postgres";
import { type VerifiedIdentity } from "@/lib/auth/identity";
import {
  type AccountProgressStore,
  type DeviceActivity,
  type NewCompletion,
  type StoredActivity,
  type StoredCompletion,
} from "./ports";

// The PostgreSQL adapter for the AccountProgressStore port. All SQL for account progress is here.

type Queryable = postgres.Sql | postgres.TransactionSql;

interface CompletionRow {
  kind?: "challenge" | null;
  lesson_id: string;
  lesson_type: LessonType;
  course_id: string | null;
  xp: number;
  completed_at: Date;
}

const toCompletion = (row: CompletionRow): StoredCompletion => ({
  ...(row.kind === "challenge" ? { kind: "challenge" as const } : {}),
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
    SELECT lesson_id, lesson_type, course_id, xp, completed_at, NULL AS kind
    FROM lesson_completions WHERE user_id = ${userId}
    UNION ALL
    SELECT challenge_id AS lesson_id, 'challenge' AS lesson_type, NULL AS course_id,
      xp, completed_at, 'challenge' AS kind
    FROM challenge_completions WHERE user_id = ${userId}
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
  if (completion.kind === "challenge") {
    const [inserted] = await sql<{ challenge_id: string; xp: number; completed_at: Date }[]>`
      INSERT INTO challenge_completions (user_id, challenge_id, xp)
      VALUES (${userId}, ${completion.lessonId}, ${completion.xp})
      ON CONFLICT (user_id, challenge_id) DO NOTHING
      RETURNING challenge_id, xp, completed_at
    `;
    const [existing] = inserted
      ? [inserted]
      : await sql<{ challenge_id: string; xp: number; completed_at: Date }[]>`
      SELECT challenge_id, xp, completed_at FROM challenge_completions
      WHERE user_id = ${userId} AND challenge_id = ${completion.lessonId}
    `;

    return {
      created: Boolean(inserted),
      completion: {
        kind: "challenge",
        lessonId: existing.challenge_id,
        lessonType: "challenge",
        courseId: null,
        xp: existing.xp,
        completedAt: existing.completed_at,
      },
    };
  }
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

/**
 * Everything besides completions, with counters summed over every device **except** `deviceId`.
 * The asking device keeps its own counters locally and adds them, so uploading them again can
 * never count them twice.
 */
export async function readActivity(
  sql: Queryable,
  userId: string,
  deviceId: string | null,
): Promise<StoredActivity> {
  // Sequential on purpose: these share one transaction's connection.
  const exclude = deviceId ?? "";
  const commands = await sql<
    { command: string; uses: string; successes: string; last_used_at: Date }[]
  >`
    SELECT command, SUM(uses) AS uses, SUM(successes) AS successes,
           MAX(last_used_at) AS last_used_at
    FROM command_stats
    WHERE user_id = ${userId} AND device_id <> ${exclude}
    GROUP BY command ORDER BY command
  `;
  const sessions = await sql<{ total: string | null }[]>`
    SELECT SUM(playground_sessions) AS total FROM device_activity
    WHERE user_id = ${userId} AND device_id <> ${exclude}
  `;
  const hints = await sql<{ content_key: string; hint: string }[]>`
    SELECT content_key, hint FROM revealed_hints
    WHERE user_id = ${userId} ORDER BY content_key, hint
  `;
  const last = await sql<{ course_id: string; lesson_id: string; visited_at: Date }[]>`
    SELECT course_id, lesson_id, visited_at FROM last_lessons WHERE user_id = ${userId}
  `;
  // Only recent releases matter: the banner is for the current one.
  const releases = await sql<{ release_version: string; seen_at: Date }[]>`
    SELECT release_version, seen_at FROM seen_releases
    WHERE user_id = ${userId} ORDER BY seen_at DESC, release_version LIMIT 100
  `;

  const revealedHints: Record<string, string[]> = {};
  for (const row of hints) (revealedHints[row.content_key] ??= []).push(row.hint);
  const lastRow = last[0];
  return {
    // SUM() comes back as a string from PostgreSQL's bigint.
    commandStats: commands.map((row) => ({
      command: row.command,
      uses: Number(row.uses),
      successes: Number(row.successes),
      lastUsedAt: row.last_used_at,
    })),
    playgroundSessions: Number(sessions[0]?.total ?? 0),
    revealedHints,
    lastLesson: lastRow
      ? {
          courseId: lastRow.course_id,
          lessonId: lastRow.lesson_id,
          visitedAt: lastRow.visited_at,
        }
      : null,
    seenReleases: Object.fromEntries(releases.map((row) => [row.release_version, row.seen_at])),
  };
}

/**
 * Writes one device's own progress. Counters are replaced for that device only, and never
 * lowered: an upload that arrives out of order after a newer one leaves the newer totals alone.
 * Hints and seen releases insert as sets, and the last lesson only moves forward in time.
 */
export async function writeDeviceActivity(
  sql: Queryable,
  userId: string,
  activity: DeviceActivity,
): Promise<void> {
  for (const stat of activity.commandStats) {
    await sql`
      INSERT INTO command_stats (user_id, device_id, command, uses, successes, last_used_at)
      VALUES (${userId}, ${activity.deviceId}, ${stat.command}, ${stat.uses}, ${stat.successes},
              ${stat.lastUsedAt})
      ON CONFLICT (user_id, device_id, command) DO UPDATE
        SET uses = GREATEST(command_stats.uses, EXCLUDED.uses),
            successes = LEAST(
              GREATEST(command_stats.successes, EXCLUDED.successes),
              GREATEST(command_stats.uses, EXCLUDED.uses)
            ),
            last_used_at = GREATEST(command_stats.last_used_at, EXCLUDED.last_used_at)
    `;
  }

  await sql`
    INSERT INTO device_activity (user_id, device_id, playground_sessions)
    VALUES (${userId}, ${activity.deviceId}, ${activity.playgroundSessions})
    ON CONFLICT (user_id, device_id) DO UPDATE
      SET playground_sessions = GREATEST(
            device_activity.playground_sessions, EXCLUDED.playground_sessions
          ),
          updated_at = now()
  `;

  const hints = Object.entries(activity.revealedHints).flatMap(([contentKey, list]) =>
    list.map((hint) => ({ user_id: userId, content_key: contentKey, hint })),
  );
  if (hints.length > 0) {
    await sql`
      INSERT INTO revealed_hints ${sql(hints, "user_id", "content_key", "hint")}
      ON CONFLICT (user_id, content_key, hint) DO NOTHING
    `;
  }

  const releases = Object.entries(activity.seenReleases).map(([version, seenAt]) => ({
    user_id: userId,
    release_version: version,
    seen_at: seenAt,
  }));
  if (releases.length > 0) {
    // The earliest time wins, so every device converges whatever order uploads arrive in.
    await sql`
      INSERT INTO seen_releases ${sql(releases, "user_id", "release_version", "seen_at")}
      ON CONFLICT (user_id, release_version) DO UPDATE
        SET seen_at = EXCLUDED.seen_at
        WHERE EXCLUDED.seen_at < seen_releases.seen_at
    `;
  }

  if (activity.lastLesson) {
    const { courseId, lessonId, visitedAt } = activity.lastLesson;
    await sql`
      INSERT INTO last_lessons (user_id, course_id, lesson_id, visited_at)
      VALUES (${userId}, ${courseId}, ${lessonId}, ${visitedAt})
      ON CONFLICT (user_id) DO UPDATE
        SET course_id = EXCLUDED.course_id,
            lesson_id = EXCLUDED.lesson_id,
            visited_at = EXCLUDED.visited_at
        WHERE EXCLUDED.visited_at > last_lessons.visited_at
           -- Equal times are broken by lesson id, so every device settles on the same answer.
           OR (EXCLUDED.visited_at = last_lessons.visited_at
               AND EXCLUDED.lesson_id > last_lessons.lesson_id)
    `;
  }
}

export function createPostgresProgressStore(sql: postgres.Sql): AccountProgressStore {
  return {
    async read(identity, deviceId) {
      return sql.begin(async (tx) => {
        const accountId = await upsertUser(tx, identity);
        const completions = await listCompletions(tx, accountId);
        const activity = await readActivity(tx, accountId, deviceId ?? null);
        return { accountId, completions, activity };
      });
    },
    async recordCompletion(identity, completion) {
      return sql.begin(async (tx) => {
        const userId = await upsertUser(tx, identity);
        const result = await insertCompletion(tx, userId, completion);
        return { ...result, completions: await listCompletions(tx, userId) };
      });
    },
    async syncActivity(identity, activity) {
      // One transaction: the device's rows are written and the merged view read together, so a
      // concurrent upload from another device is either fully included or not at all.
      return sql.begin(async (tx) => {
        const accountId = await upsertUser(tx, identity);
        await writeDeviceActivity(tx, accountId, activity);
        const completions = await listCompletions(tx, accountId);
        const merged = await readActivity(tx, accountId, activity.deviceId);
        return { accountId, completions, activity: merged };
      });
    },
  };
}
