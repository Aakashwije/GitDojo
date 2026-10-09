// @vitest-environment node
//
// PostgreSQL integration tests: the real migrations, constraints, queries and transactions.
// Runs only with TEST_DATABASE_URL (`pnpm test:db`); skipped otherwise. The URL must name a
// dedicated test database (its name contains "test"): GitDojo's tables there are dropped and
// migrated from scratch on every run.
import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getProgress,
  recordChallengeCompletion,
  recordLessonCompletion,
  syncProgress,
} from "./api";
import { createPostgresProgressStore, insertCompletion, upsertUser } from "./postgres-store";
import { ADA, ADA_ELSEWHERE, apiDeps, GRACE, postLesson, postSync } from "./testing";

vi.mock("server-only", () => ({}));
vi.mock("@asgardeo/nextjs/server", () => ({ asgardeo: vi.fn() }));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const APP_DIR = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS_DIR = path.join(APP_DIR, "db", "migrations");
const run = promisify(execFile);

function migrateCommand(databaseUrl: string, args: string[] = []) {
  return run(process.execPath, ["scripts/migrate.mjs", ...args], {
    cwd: APP_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

const identity = (subject: string) => ({ ...ADA, subject, name: null, email: null });

/** Refuses anything that is not plainly a dedicated test database. */
function testDatabaseUrl(value: string): string {
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.toLowerCase().includes("test")) {
    throw new Error(`TEST_DATABASE_URL must name a dedicated test database (got "${database}").`);
  }
  if (value === process.env.DATABASE_URL?.trim()) {
    throw new Error("TEST_DATABASE_URL must not be the same as DATABASE_URL.");
  }
  return value;
}

const resetTables = (sql: postgres.Sql) =>
  sql`DROP TABLE IF EXISTS command_stats, device_activity, revealed_hints, last_lessons,
      seen_releases, challenge_completions, lesson_completions, users, gitdojo_schema_migrations`;

describe.skipIf(!TEST_DATABASE_URL)("PostgreSQL account progress", () => {
  let sql: postgres.Sql;
  let url: string;

  beforeAll(async () => {
    url = testDatabaseUrl(TEST_DATABASE_URL ?? "");
    sql = postgres(url, { max: 10, onnotice: () => undefined });
    await resetTables(sql);
    const { stdout } = await migrateCommand(url);
    expect(stdout).toContain("Applied 0001_users_and_lesson_completions");
  });

  afterAll(async () => {
    await resetTables(sql);
    await sql.end({ timeout: 5 });
  });

  describe("migrations", () => {
    it("are repeatable: a second run changes nothing", async () => {
      const { stdout } = await migrateCommand(url);
      expect(stdout).toContain("Database is up to date.");
      const ledger = await sql`SELECT version FROM gitdojo_schema_migrations`;
      expect(ledger.map((row) => row.version as string)).toEqual(
        (await readdir(MIGRATIONS_DIR)).map((name) => name.replace(/\.sql$/, "")).sort(),
      );
    });

    it("refuse to run when an applied migration was edited", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "gitdojo-migrations-"));
      try {
        await cp(MIGRATIONS_DIR, dir, { recursive: true });
        await writeFile(
          path.join(dir, "0001_users_and_lesson_completions.sql"),
          "CREATE TABLE edited (id int);",
        );
        const failed = await migrateCommand(url, ["--dir", dir]).catch(
          (error: unknown) => error as { code: number; stderr: string },
        );
        expect(failed).toMatchObject({ code: 1 });
        expect((failed as { stderr: string }).stderr).toContain("changed after it was applied");
        expect((failed as { stderr: string }).stderr).not.toContain(url);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("constraints", () => {
    /** The SQLSTATE an insert fails with. Runs on its own connection, closed afterwards. */
    async function insertError(table: string, values: Record<string, unknown>) {
      const once = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        await once`INSERT INTO ${once(table)} ${once(values)}`;
        return "ok";
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await once.end({ timeout: 5 });
      }
    }

    it("keep one user per issuer and subject", async () => {
      const values = { issuer: "https://idp.example/oauth2/token", subject: "dup" };
      await sql`INSERT INTO users ${sql(values)}`;
      expect(await insertError("users", values)).toBe("23505");
    });

    it("link completions to existing users only, once per lesson", async () => {
      const lesson = { lesson_id: "git-init", lesson_type: "interactive", xp: 50 };
      const orphan = { ...lesson, user_id: "00000000-0000-4000-8000-000000000000" };
      expect(await insertError("lesson_completions", orphan)).toBe("23503");

      const userId = await upsertUser(sql, identity("constraints"));
      await sql`INSERT INTO lesson_completions ${sql({ ...lesson, user_id: userId })}`;
      expect(await insertError("lesson_completions", { ...lesson, user_id: userId })).toBe("23505");
    });

    it("reject malformed lesson ids, types and XP", async () => {
      const userId = await upsertUser(sql, identity("checks"));
      const base = { user_id: userId, lesson_id: "git-add", lesson_type: "concept", xp: 25 };
      for (const bad of [{ lesson_id: "../etc" }, { lesson_type: "bonus" }, { xp: -5 }]) {
        expect(await insertError("lesson_completions", { ...base, ...bad })).toBe("23514");
      }
    });

    it("remove a user's completions with the user", async () => {
      const userId = await upsertUser(sql, identity("cascade"));
      await insertCompletion(sql, userId, {
        lessonId: "git-init",
        lessonType: "interactive",
        courseId: null,
        xp: 50,
      });
      await sql`DELETE FROM users WHERE id = ${userId}`;
      const [row] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM lesson_completions WHERE user_id = ${userId}
      `;
      expect(row?.count).toBe(0);
    });
  });

  describe("users", () => {
    it("are created on first access and found again by issuer and subject", async () => {
      const first = await upsertUser(sql, ADA);
      expect(await upsertUser(sql, ADA)).toBe(first);
      expect(await upsertUser(sql, GRACE)).not.toBe(first);
      // The same subject from another organization is a different person.
      expect(await upsertUser(sql, ADA_ELSEWHERE)).not.toBe(first);
    });

    it("keep their profile up to date without changing the id", async () => {
      const id = await upsertUser(sql, ADA);
      expect(await upsertUser(sql, { ...ADA, name: "Ada King", email: "ada@new.example" })).toBe(
        id,
      );
      const [row] = await sql`SELECT name, email FROM users WHERE id = ${id}`;
      expect(row).toEqual({ name: "Ada King", email: "ada@new.example" });
      await upsertUser(sql, ADA);
    });

    it("are created once under concurrent first requests", async () => {
      const newcomer = identity("concurrent-newcomer");
      const ids = await Promise.all(Array.from({ length: 12 }, () => upsertUser(sql, newcomer)));
      expect(new Set(ids).size).toBe(1);
      const [row] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM users WHERE subject = ${newcomer.subject}
      `;
      expect(row?.count).toBe(1);
    });
  });

  describe("API with PostgreSQL", () => {
    const deps = (who: Parameters<typeof apiDeps>[0]) =>
      apiDeps(who, createPostgresProgressStore(sql));
    const body = async (response: Response) => (await response.json()) as Record<string, unknown>;

    it("persists standalone challenge XP once under concurrent requests and isolates accounts", async () => {
      const learner = identity("challenge-learner");
      const replies = await Promise.all(
        Array.from({ length: 8 }, () =>
          recordChallengeCompletion(postLesson({ challengeId: "detached-head" }), deps(learner)),
        ),
      );
      expect(replies.filter((reply) => reply.status === 201)).toHaveLength(1);
      expect(replies.filter((reply) => reply.status === 200)).toHaveLength(7);
      expect(await body(await getProgress(deps(learner)))).toMatchObject({
        completedLessons: [],
        completedChallenges: [{ challengeId: "detached-head", xp: 100 }],
        totalXp: 100,
      });
      expect(
        await body(await getProgress(deps(identity("other-challenge-learner")))),
      ).toMatchObject({
        completedChallenges: [],
        totalXp: 0,
      });
      const rows =
        await sql`SELECT xp FROM challenge_completions JOIN users ON users.id = user_id WHERE subject = ${learner.subject}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.xp).toBe(100);
    });

    it("records and returns an account's lessons, keeping the first completion", async () => {
      const learner = identity("api-learner");
      const first = await recordLessonCompletion(
        postLesson({ lessonId: "git-init" }),
        deps(learner),
      );
      expect(first.status).toBe(201);
      const firstBody = await body(first);

      await new Promise((resolve) => setTimeout(resolve, 20));
      const again = await recordLessonCompletion(
        postLesson({ lessonId: "git-init" }),
        deps(learner),
      );
      expect(again.status).toBe(200);
      const againBody = await body(again);
      expect(againBody).toMatchObject({ alreadyCompleted: true, totalXp: 50 });
      expect(againBody.lesson).toEqual(firstBody.lesson);

      await recordLessonCompletion(postLesson({ lessonId: "what-is-git" }), deps(learner));
      expect(await body(await getProgress(deps(learner)))).toMatchObject({
        totalXp: 75,
        completedLessons: [
          { lessonId: "git-init", xp: 50, title: "git init" },
          { lessonId: "what-is-git", xp: 25, type: "concept" },
        ],
      });
    });

    it("never shows or changes another account's records", async () => {
      const owner = identity("isolation-owner");
      await recordLessonCompletion(postLesson({ lessonId: "git-init" }), deps(owner));
      for (const other of [
        identity("isolation-other"),
        { ...owner, issuer: "https://x/oauth2/token" },
      ]) {
        expect(await body(await getProgress(deps(other)))).toMatchObject({
          completedLessons: [],
          totalXp: 0,
        });
        const write = await recordLessonCompletion(
          postLesson({ lessonId: "git-init" }),
          deps(other),
        );
        expect(await body(write)).toMatchObject({ alreadyCompleted: false, totalXp: 50 });
      }
      expect(await body(await getProgress(deps(owner)))).toMatchObject({ totalXp: 50 });
    });

    it("awards XP once under concurrent duplicate completions", async () => {
      const learner = identity("concurrent-learner");
      const responses = await Promise.all(
        Array.from({ length: 16 }, () =>
          recordLessonCompletion(
            postLesson({ lessonId: "first-repository-challenge" }),
            deps(learner),
          ),
        ),
      );
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 200)).toHaveLength(15);
      const bodies = await Promise.all(responses.map(body));
      expect(
        new Set(bodies.map((b) => (b.lesson as { completedAt: string }).completedAt)).size,
      ).toBe(1);
      expect(new Set(bodies.map((b) => b.totalXp))).toEqual(new Set([100]));

      const [totals] = await sql<{ count: number; xp: number }[]>`
        SELECT count(*)::int AS count, sum(c.xp)::int AS xp
        FROM lesson_completions c JOIN users u ON u.id = c.user_id
        WHERE u.subject = ${learner.subject}
      `;
      expect(totals).toEqual({ count: 1, xp: 100 });
    });

    it("totals concurrent completions of different lessons correctly", async () => {
      const learner = identity("concurrent-mixed");
      const lessons = ["what-is-git", "git-init", "first-repository-challenge", "first-commit"];
      await Promise.all(
        [...lessons, ...lessons].map((lessonId) =>
          recordLessonCompletion(postLesson({ lessonId }), deps(learner)),
        ),
      );
      expect(await body(await getProgress(deps(learner)))).toMatchObject({ totalXp: 225 });
    });
  });

  describe("device activity with PostgreSQL", () => {
    const deps = (who: Parameters<typeof apiDeps>[0]) =>
      apiDeps(who, createPostgresProgressStore(sql));
    const body = async (response: Response) => (await response.json()) as Record<string, unknown>;
    const at = (offset: number) => new Date(Date.UTC(2026, 9, 9, 12) + offset).toISOString();
    const upload = (
      deviceId: string,
      overrides: Record<string, unknown> = {},
      who = identity("sync-learner"),
    ) =>
      syncProgress(
        postSync({
          schemaVersion: 3,
          deviceId,
          commandStats: { commit: { uses: 1, successes: 1, lastUsedAt: at(0) } },
          playgroundSessions: 1,
          revealedHints: { "lesson:git-init": ["stage#0"] },
          lastLesson: { courseId: "git-basics", lessonId: "git-init", visitedAt: at(0) },
          seenReleases: { "v0.1.1": at(0) },
          ...overrides,
        }),
        deps(who),
      );
    const activityOf = async (response: Response) =>
      (await body(response)).activity as {
        commandStats: Record<string, { uses: number; successes: number }>;
        playgroundSessions: number;
        revealedHints: Record<string, string[]>;
        lastLesson: { lessonId: string } | null;
        seenReleases: Record<string, string>;
      };

    it("sums counters per device, excludes the asking one, and never lowers a row", async () => {
      const learner = identity("sync-counters");
      const laptop = (overrides: Record<string, unknown>) => upload("laptop", overrides, learner);

      await laptop({
        commandStats: { commit: { uses: 10, successes: 9, lastUsedAt: at(-5000) } },
        playgroundSessions: 2,
      });
      await upload(
        "phone",
        {
          commandStats: { commit: { uses: 4, successes: 4, lastUsedAt: at(-1000) } },
          playgroundSessions: 3,
        },
        learner,
      );

      // A third device sees both of the others.
      const tablet = await activityOf(
        await upload("tablet", { commandStats: {}, playgroundSessions: 0 }, learner),
      );
      expect(tablet.commandStats.commit).toMatchObject({ uses: 14, successes: 13 });
      expect(tablet.playgroundSessions).toBe(5);

      // The laptop's own row is left out of its view.
      const forLaptop = await activityOf(await laptop({ commandStats: {} }));
      expect(forLaptop.commandStats.commit).toMatchObject({ uses: 4 });

      // A stale upload arriving late must not undo newer totals (GREATEST in the upsert).
      await laptop({
        commandStats: { commit: { uses: 1, successes: 1, lastUsedAt: at(-9000) } },
        playgroundSessions: 0,
      });
      const after = await activityOf(
        await upload("tablet", { commandStats: {}, playgroundSessions: 0 }, learner),
      );
      expect(after.commandStats.commit).toMatchObject({ uses: 14 });
      expect(after.playgroundSessions).toBe(5);
    });

    it("is idempotent under concurrent duplicate uploads", async () => {
      const learner = identity("sync-concurrent");
      await Promise.all(
        Array.from({ length: 6 }, () =>
          upload(
            "laptop",
            { commandStats: { commit: { uses: 3, successes: 2, lastUsedAt: at(0) } } },
            learner,
          ),
        ),
      );
      const other = await activityOf(
        await upload("other", { commandStats: {}, playgroundSessions: 0 }, learner),
      );
      expect(other.commandStats.commit).toMatchObject({ uses: 3, successes: 2 });
      expect(other.playgroundSessions).toBe(1);
      const [rows] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM command_stats c JOIN users u ON u.id = c.user_id
        WHERE u.subject = ${learner.subject}
      `;
      // One row per (device, command), however many uploads arrived.
      expect(rows).toEqual({ count: 1 });
    });

    it("unions hints and keeps the most recent lesson visit", async () => {
      const learner = identity("sync-hints");
      await upload(
        "laptop",
        {
          revealedHints: { "lesson:git-init": ["stage#0", "stage#1"] },
          lastLesson: { courseId: "git-basics", lessonId: "git-init", visitedAt: at(-60_000) },
        },
        learner,
      );
      const phone = await activityOf(
        await upload(
          "phone",
          {
            revealedHints: {
              "lesson:git-init": ["stage#0", "commit#0"],
              "challenge:detached-head": ["branch#0"],
            },
            lastLesson: { courseId: "git-basics", lessonId: "what-is-git", visitedAt: at(0) },
          },
          learner,
        ),
      );
      expect(phone.revealedHints["lesson:git-init"]).toEqual(["commit#0", "stage#0", "stage#1"]);
      expect(phone.revealedHints["challenge:detached-head"]).toEqual(["branch#0"]);
      expect(phone.lastLesson).toMatchObject({ lessonId: "what-is-git" });

      // An older visit arriving afterwards does not move it back.
      const late = await activityOf(
        await upload(
          "laptop",
          { lastLesson: { courseId: "git-basics", lessonId: "git-init", visitedAt: at(-90_000) } },
          learner,
        ),
      );
      expect(late.lastLesson).toMatchObject({ lessonId: "what-is-git" });
    });

    it("stores seen releases as a set, keeping the earliest time under concurrent uploads", async () => {
      const learner = identity("sync-releases");
      await Promise.all([
        upload("laptop", { seenReleases: { "v0.1.12": at(-5000) } }, learner),
        upload("phone", { seenReleases: { "v0.1.12": at(-1000) } }, learner),
        upload("laptop", { seenReleases: { "v0.1.12": at(-5000) } }, learner),
      ]);
      const view = await activityOf(await upload("tablet", { seenReleases: {} }, learner));
      expect(view.seenReleases["v0.1.12"]).toBe(at(-5000));
      const [rows] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM seen_releases s JOIN users u ON u.id = s.user_id
        WHERE u.subject = ${learner.subject} AND s.release_version = 'v0.1.12'
      `;
      expect(rows).toEqual({ count: 1 });
    });

    it("keeps one account's activity out of another's", async () => {
      const ada = identity("sync-ada");
      const grace = identity("sync-grace");
      await upload("shared-device-id", {}, ada);
      const view = await activityOf(
        await upload(
          "shared-device-id",
          { commandStats: {}, revealedHints: {}, seenReleases: {} },
          grace,
        ),
      );
      expect(view.commandStats).toEqual({});
      expect(view.seenReleases).toEqual({});
      expect(view.revealedHints).toEqual({});
      expect(view.playgroundSessions).toBe(0);
    });

    it("refuses activity the constraints forbid, without touching anything else", async () => {
      const learner = identity("sync-invalid");
      await upload("laptop", {}, learner);
      const rejected = await upload(
        "laptop",
        { commandStats: { commit: { uses: 1, successes: 5, lastUsedAt: at(0) } } },
        learner,
      );
      expect(rejected.status).toBe(400);
      const [rows] = await sql<{ uses: number }[]>`
        SELECT uses FROM command_stats c JOIN users u ON u.id = c.user_id
        WHERE u.subject = ${learner.subject}
      `;
      expect(rows).toEqual({ uses: 1 });
    });

    it("removes a learner's activity with their account", async () => {
      const learner = identity("sync-cascade");
      await upload("laptop", {}, learner);
      const [user] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE issuer = ${learner.issuer} AND subject = ${learner.subject}
      `;
      const userId = user?.id;
      expect(userId).toBeDefined();

      // Count this learner's rows only: the tests above left other learners' behind.
      const rowsFor = async (table: string) => {
        const [row] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM ${sql(table)} WHERE user_id = ${userId ?? ""}
        `;
        return row?.count ?? -1;
      };
      const tables = [
        "command_stats",
        "device_activity",
        "revealed_hints",
        "last_lessons",
        "seen_releases",
      ];
      // Each table has something to lose, so the assertions below cannot pass vacuously.
      for (const table of tables)
        expect(await rowsFor(table), `${table} before`).toBeGreaterThan(0);

      await sql`DELETE FROM users WHERE id = ${userId ?? ""}`;
      for (const table of tables) expect(await rowsFor(table), table).toBe(0);
    });
  });
});
