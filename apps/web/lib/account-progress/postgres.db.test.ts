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
import { getProgress, recordLessonCompletion } from "./api";
import { createPostgresProgressStore, insertCompletion, upsertUser } from "./store";
import { ADA, ADA_ELSEWHERE, apiDeps, GRACE, postLesson } from "./testing";

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
  sql`DROP TABLE IF EXISTS lesson_completions, users, gitdojo_schema_migrations`;

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
        expect(await body(await getProgress(deps(other)))).toEqual({
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
});
