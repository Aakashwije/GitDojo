// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { getProgress, recordLessonCompletion, type ProgressApiDeps } from "./api";
import {
  ADA,
  ADA_ELSEWHERE,
  apiDeps,
  createMemoryProgressStore,
  GRACE,
  postLesson,
} from "./testing";

vi.mock("server-only", () => ({}));
// Identity is injected; the SDK is never reached.
vi.mock("@asgardeo/nextjs/server", () => ({ asgardeo: vi.fn() }));

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;
const errorCode = async (response: Response) =>
  ((await json(response)).error as { code: string }).code;

function failingStore(cause: Error): ProgressApiDeps["store"] {
  return () => ({
    read: () => Promise.reject(cause),
    recordLesson: () => Promise.reject(cause),
  });
}

describe("GET /api/progress", () => {
  it.each(["database", "catalog"] as const)(
    "identifies a %s URL failure without exposing its input or stack",
    async (step) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const secret = "postgresql://owner:private-password@host/db";
        const cause = Object.assign(new TypeError(`Invalid URL: ${secret}`), {
          code: "ERR_INVALID_URL",
          input: secret,
        });
        const deps = apiDeps(ADA);
        if (step === "database")
          deps.store = () => {
            throw cause;
          };
        else deps.catalog = () => Promise.reject(cause);
        const response = await getProgress(deps);
        expect(response.status).toBe(500);
        expect(JSON.stringify(log.mock.calls)).toContain(`step=${step}`);
        expect(JSON.stringify(log.mock.calls)).toContain("ERR_INVALID_URL");
        expect(JSON.stringify(log.mock.calls)).not.toContain("private-password");
        expect(await response.text()).not.toContain("private-password");
      } finally {
        log.mockRestore();
      }
    },
  );

  it("rejects signed-out requests without touching the database", async () => {
    const store = vi.fn(createMemoryProgressStore);
    const response = await getProgress({ ...apiDeps({ status: "unauthenticated" }), store });
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthenticated");
    expect(store).not.toHaveBeenCalled();
  });

  it("denies access when the session cannot be verified", async () => {
    const store = vi.fn(createMemoryProgressStore);
    const response = await getProgress({ ...apiDeps({ status: "unavailable" }), store });
    expect(response.status).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });

  it("returns an empty record for a new account", async () => {
    const response = await getProgress(apiDeps(ADA));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      account: { id: expect.any(String) as unknown },
      completedLessons: [],
      completedChallenges: [],
      totalXp: 0,
    });
  });

  it("returns completed lessons with metadata from the content catalog", async () => {
    const store = createMemoryProgressStore();
    await recordLessonCompletion(postLesson({ lessonId: "git-init" }), apiDeps(ADA, store));
    const body = await json(await getProgress(apiDeps(ADA, store)));
    expect(body).toMatchObject({
      totalXp: 50,
      completedLessons: [
        {
          lessonId: "git-init",
          title: "git init",
          type: "interactive",
          xp: 50,
          course: { id: "git-basics", slug: "git-basics", title: "Git Basics" },
        },
      ],
    });
  });

  it("only ever shows the signed-in learner's own records", async () => {
    const store = createMemoryProgressStore();
    await recordLessonCompletion(postLesson({ lessonId: "git-init" }), apiDeps(ADA, store));
    const ada = await json(await getProgress(apiDeps(ADA, store)));
    for (const other of [GRACE, ADA_ELSEWHERE]) {
      const body = await json(await getProgress(apiDeps(other, store)));
      expect(body).toMatchObject({ completedLessons: [], totalXp: 0 });
      // Each account has its own id, so browsers keep their caches apart.
      expect(body.account).not.toEqual(ada.account);
    }
  });

  it("is never cached", async () => {
    for (const response of [
      await getProgress(apiDeps(ADA)),
      await getProgress(apiDeps({ status: "unauthenticated" })),
    ]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("answers database failures generically, without logging details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = Object.assign(new Error('relation "users" does not exist ada@example.com'), {
      code: "42P01",
    });
    const response = await getProgress({ ...apiDeps(ADA), store: failingStore(cause) });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("relation");
    expect(JSON.stringify(log.mock.calls)).not.toContain("ada@example.com");
    expect(JSON.stringify(log.mock.calls)).toContain("42P01");
    log.mockRestore();
  });

  it("reports 503 when the database is not configured", async () => {
    const store = () => {
      throw new DatabaseNotConfiguredError();
    };
    const response = await getProgress({ ...apiDeps(ADA), store });
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("progress_unavailable");
  });
});

describe("POST /api/progress/lessons", () => {
  it("rejects signed-out requests without touching the database", async () => {
    const store = vi.fn(createMemoryProgressStore);
    const response = await recordLessonCompletion(postLesson({ lessonId: "git-init" }), {
      ...apiDeps({ status: "unauthenticated" }),
      store,
    });
    expect(response.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it("rejects cross-origin writes before checking the session", async () => {
    const deps = apiDeps(ADA);
    const verifyIdentity = vi.fn(deps.verifyIdentity);
    for (const request of [
      postLesson({ lessonId: "git-init" }, { origin: "https://evil.example" }),
      postLesson({ lessonId: "git-init" }, { origin: "" }),
      postLesson({ lessonId: "git-init" }, { headers: { "sec-fetch-site": "cross-site" } }),
    ]) {
      const response = await recordLessonCompletion(request, { ...deps, verifyIdentity });
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("cross_origin");
    }
    expect(verifyIdentity).not.toHaveBeenCalled();
  });

  it("records a completion with XP computed from the content catalog", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    const cases = [
      ["what-is-git", "concept", 25],
      ["git-init", "interactive", 50],
      ["first-repository-challenge", "challenge", 100],
      ["first-commit", "interactive", 50],
    ] as const;
    let total = 0;
    for (const [lessonId, type, xp] of cases) {
      total += xp;
      const response = await recordLessonCompletion(postLesson({ lessonId }), deps);
      expect(response.status).toBe(201);
      expect(await json(response)).toMatchObject({
        lesson: { lessonId, type, xp },
        alreadyCompleted: false,
        totalXp: total,
      });
    }
    expect(total).toBe(225);
  });

  it("is idempotent: repeats keep the first completion and never add XP", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    const first = await json(
      await recordLessonCompletion(postLesson({ lessonId: "git-init" }), deps),
    );
    const again = await recordLessonCompletion(postLesson({ lessonId: "git-init" }), deps);
    expect(again.status).toBe(200);
    const body = await json(again);
    expect(body).toMatchObject({ alreadyCompleted: true, totalXp: 50 });
    expect((body.lesson as { completedAt: string }).completedAt).toBe(
      (first.lesson as { completedAt: string }).completedAt,
    );
  });

  it.each([
    ["client-supplied XP", { lessonId: "git-init", xp: 9999 }],
    ["a user id", { lessonId: "git-init", userId: "someone-else" }],
    ["a completion time", { lessonId: "git-init", completedAt: "2020-01-01T00:00:00Z" }],
    ["a subject", { lessonId: "git-init", sub: "grace-subject" }],
  ])("rejects %s", async (_label, body) => {
    const store = createMemoryProgressStore();
    const response = await recordLessonCompletion(postLesson(body), apiDeps(ADA, store));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("unexpected_fields");
    expect(store.rows.size).toBe(0);
  });

  it.each([
    ["invalid JSON", "{lessonId:", 400, "invalid_json"],
    ["an array", [{ lessonId: "git-init" }], 400, "invalid_body"],
    ["null", null, 400, "invalid_body"],
    ["no lesson id", {}, 400, "invalid_lesson_id"],
    ["a numeric lesson id", { lessonId: 7 }, 400, "invalid_lesson_id"],
    ["a malformed lesson id", { lessonId: "../git-init" }, 400, "invalid_lesson_id"],
    ["an upper-case lesson id", { lessonId: "Git-Init" }, 400, "invalid_lesson_id"],
    ["an oversized lesson id", { lessonId: "a".repeat(101) }, 400, "invalid_lesson_id"],
    ["an unknown lesson", { lessonId: "no-such-lesson" }, 422, "unknown_lesson"],
    // Standalone challenges are a separate namespace, not lessons.
    ["a challenge id", { lessonId: "detached-head" }, 422, "unknown_lesson"],
  ])("rejects %s", async (_label, body, status, code) => {
    const store = createMemoryProgressStore();
    const response = await recordLessonCompletion(postLesson(body), apiDeps(ADA, store));
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
    expect(store.rows.size).toBe(0);
  });

  it("rejects bodies that are not JSON or too large", async () => {
    const wrongType = postLesson(
      { lessonId: "git-init" },
      {
        headers: { "content-type": "text/plain" },
      },
    );
    expect((await recordLessonCompletion(wrongType, apiDeps(ADA))).status).toBe(415);

    const huge = postLesson({ lessonId: "git-init", padding: "x".repeat(5000) });
    expect((await recordLessonCompletion(huge, apiDeps(ADA))).status).toBe(413);
  });

  it("writes only to the signed-in learner's records", async () => {
    const store = createMemoryProgressStore();
    await recordLessonCompletion(postLesson({ lessonId: "git-init" }), apiDeps(ADA, store));
    const grace = await recordLessonCompletion(
      postLesson({ lessonId: "git-init" }),
      apiDeps(GRACE, store),
    );
    expect(grace.status).toBe(201);
    expect(await json(grace)).toMatchObject({ alreadyCompleted: false, totalXp: 50 });
    expect(store.rows.size).toBe(2);
  });

  it("answers database failures generically and keeps responses private", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await recordLessonCompletion(postLesson({ lessonId: "git-init" }), {
      ...apiDeps(ADA),
      store: failingStore(new Error("connection terminated")),
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("connection terminated");
    log.mockRestore();
  });
});
