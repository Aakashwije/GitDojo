// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getProgress, recordLessonCompletion, recordPracticeCompletion } from "./api";
import { ADA, GRACE, apiDeps, createMemoryProgressStore, postLesson, CATALOG } from "./testing";
vi.mock("server-only", () => ({}));
vi.mock("@asgardeo/nextjs/server", () => ({ asgardeo: vi.fn() }));

describe("practice account progress", () => {
  it("records a solved task once, with no XP, and isolates accounts", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    const replies = await Promise.all(
      Array.from({ length: 4 }, () =>
        recordPracticeCompletion(postLesson({ taskId: "tag-a-release" }), deps),
      ),
    );
    expect(replies.filter((r) => r.status === 201)).toHaveLength(1);
    expect(replies.filter((r) => r.status === 200)).toHaveLength(3);
    const first: unknown = await replies[0]?.json();
    expect(first).toMatchObject({ practice: { taskId: "tag-a-release", title: "Tag a Release" } });
    const body: unknown = await getProgress(apiDeps(ADA, store)).then((r) => r.json());
    expect(body).toMatchObject({
      totalXp: 0,
      completedLessons: [],
      completedChallenges: [],
      completedPractice: [{ taskId: "tag-a-release", title: "Tag a Release" }],
    });
    expect(JSON.stringify(body)).not.toMatch(/"xp":\s*[1-9]/);
    const other: unknown = await getProgress(apiDeps(GRACE, store)).then((r) => r.json());
    expect(other).toMatchObject({ completedPractice: [] });
  });

  it("keeps practice apart from lessons with the same id", async () => {
    const deps = apiDeps(ADA);
    deps.catalog = () =>
      Promise.resolve({
        ...CATALOG,
        practice: [
          { id: "git-init", title: "Init", skill: "repositories", difficulty: "beginner" },
        ],
      });
    await recordLessonCompletion(postLesson({ lessonId: "git-init" }), deps);
    await recordPracticeCompletion(postLesson({ taskId: "git-init" }), deps);
    expect(await getProgress(deps).then((r) => r.json())).toMatchObject({
      totalXp: 50,
      completedLessons: [{ lessonId: "git-init", xp: 50 }],
      completedPractice: [{ taskId: "git-init" }],
    });
  });

  it("rejects cross-origin, signed-out, extra fields, invalid ids and unknown tasks", async () => {
    expect(
      (
        await recordPracticeCompletion(
          postLesson({ taskId: "tag-a-release" }, { origin: "https://attacker.example" }),
          apiDeps(ADA),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await recordPracticeCompletion(
          postLesson({ taskId: "tag-a-release" }),
          apiDeps({ status: "unauthenticated" }),
        )
      ).status,
    ).toBe(401);
    for (const [body, status, code] of [
      [{ taskId: "tag-a-release", xp: 999 }, 400, "unexpected_fields"],
      [{ taskId: "../evil" }, 400, "invalid_task_id"],
      [{ lessonId: "tag-a-release" }, 400, "unexpected_fields"],
      [{ taskId: "no-such-task" }, 422, "unknown_practice_task"],
    ] as const) {
      const reply = await recordPracticeCompletion(postLesson(body), apiDeps(ADA));
      expect(reply.status).toBe(status);
      expect(await reply.json()).toMatchObject({ error: { code } });
    }
  });
});
