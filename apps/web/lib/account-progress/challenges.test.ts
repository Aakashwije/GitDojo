// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getProgress, recordChallengeCompletion, recordLessonCompletion } from "./api";
import { ADA, GRACE, apiDeps, createMemoryProgressStore, postLesson, CATALOG } from "./testing";
vi.mock("server-only", () => ({}));
vi.mock("@asgardeo/nextjs/server", () => ({ asgardeo: vi.fn() }));

describe("standalone challenge account progress", () => {
  it("stores 100 XP once, returns it on another read and isolates accounts", async () => {
    const store = createMemoryProgressStore();
    const deps = apiDeps(ADA, store);
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        recordChallengeCompletion(postLesson({ challengeId: "detached-head" }), deps),
      ),
    );
    expect(replies.filter((r) => r.status === 201)).toHaveLength(1);
    expect(replies.filter((r) => r.status === 200)).toHaveLength(4);
    const body: unknown = await getProgress(apiDeps(ADA, store)).then((r) => r.json());
    expect(body).toMatchObject({
      completedLessons: [],
      totalXp: 100,
      completedChallenges: [{ challengeId: "detached-head", xp: 100 }],
    });
    const other: unknown = await getProgress(apiDeps(GRACE, store)).then((r) => r.json());
    expect(other).toMatchObject({ completedChallenges: [], totalXp: 0 });
  });
  it("keeps lessons and challenges with identical ids distinct", async () => {
    const deps = apiDeps(ADA);
    deps.catalog = () =>
      Promise.resolve({ ...CATALOG, challenges: [{ id: "first-commit", title: "First Commit" }] });
    await recordLessonCompletion(postLesson({ lessonId: "first-commit" }), deps);
    await recordChallengeCompletion(postLesson({ challengeId: "first-commit" }), deps);
    expect(await getProgress(deps).then((r) => r.json())).toMatchObject({
      totalXp: 150,
      completedLessons: [{ lessonId: "first-commit", xp: 50 }],
      completedChallenges: [{ challengeId: "first-commit", xp: 100 }],
    });
  });
  it("rejects cross-origin, signed-out, forged XP, invalid ids and unknown challenges", async () => {
    expect(
      (
        await recordChallengeCompletion(
          postLesson({ challengeId: "detached-head" }, { origin: "https://attacker.example" }),
          apiDeps(ADA),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await recordChallengeCompletion(
          postLesson({ challengeId: "detached-head" }),
          apiDeps({ status: "unauthenticated" }),
        )
      ).status,
    ).toBe(401);
    for (const [body, status] of [
      [{ challengeId: "detached-head", xp: 999 }, 400],
      [{ challengeId: "../evil" }, 400],
      [{ challengeId: "what-is-git" }, 422],
    ] as const)
      expect((await recordChallengeCompletion(postLesson(body), apiDeps(ADA))).status).toBe(status);
  });
});
