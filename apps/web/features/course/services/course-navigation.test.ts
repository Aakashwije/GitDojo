import { type CourseOutline } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import {
  courseProgress,
  formatLessonNumber,
  lessonHref,
  lessonNeighbors,
  lessonStatus,
  nextLessonToStudy,
} from "./course-navigation";

const course: CourseOutline = {
  id: "git-basics",
  slug: "git-basics",
  title: "Git Basics",
  description: "Learn Git.",
  difficulty: "beginner",
  lessons: [
    { id: "what-is-git", slug: "what-is-git", title: "What is Git?", type: "concept", number: 1 },
    { id: "git-init", slug: "git-init", title: "Initialize", type: "interactive", number: 2 },
    { id: "challenge", slug: "challenge", title: "Challenge", type: "challenge", number: 3 },
  ],
};

describe("course navigation", () => {
  it("builds lesson links and padded numbers", () => {
    expect(lessonHref("git-basics", "git-init")).toBe("/learn/git-basics/git-init");
    expect(formatLessonNumber(3)).toBe("03");
    expect(formatLessonNumber(12)).toBe("12");
  });

  it("computes the course completion percentage", () => {
    expect(courseProgress(course, new Set())).toEqual({ completedCount: 0, total: 3, percent: 0 });
    expect(courseProgress(course, new Set(["what-is-git", "unrelated"]))).toEqual({
      completedCount: 1,
      total: 3,
      percent: 33,
    });
  });

  it("finds previous and next lessons", () => {
    expect(lessonNeighbors(course, "what-is-git")).toMatchObject({
      previous: null,
      next: { slug: "git-init" },
    });
    expect(lessonNeighbors(course, "challenge")).toMatchObject({
      previous: { slug: "git-init" },
      next: null,
    });
    expect(lessonNeighbors(course, "missing")).toBeNull();
  });

  it("suggests the first unfinished lesson", () => {
    expect(nextLessonToStudy(course, new Set(["what-is-git"]))?.slug).toBe("git-init");
    expect(nextLessonToStudy(course, new Set(course.lessons.map((l) => l.id)))).toBeNull();
  });

  it("marks completed lessons first, then the current one", () => {
    const [first, second] = course.lessons;
    const done = new Set(["what-is-git"]);
    expect(first && lessonStatus(first, done, "what-is-git")).toBe("completed");
    expect(second && lessonStatus(second, done, "git-init")).toBe("current");
    expect(second && lessonStatus(second, done, null)).toBe("upcoming");
  });
});
