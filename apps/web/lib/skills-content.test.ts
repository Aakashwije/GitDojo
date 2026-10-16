// @vitest-environment node
import { loadAllChallenges, loadAllPracticeTasks } from "@gitdojo/challenge-engine";
import { loadAllCourses, loadAllLessons } from "@gitdojo/lesson-engine";
import {
  createDirectoryCourseSource,
  createDirectoryLessonSource,
} from "@gitdojo/lesson-engine/node";
import { isSkillId, skillForConcept, skillsForConcepts } from "@gitdojo/progress";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONTENT = fileURLToPath(new URL("../../../content", import.meta.url));
const source = (dir: string) => createDirectoryLessonSource(path.join(CONTENT, dir));

describe("skills in content", async () => {
  const courses = await loadAllCourses(
    createDirectoryCourseSource(path.join(CONTENT, "courses")),
    (course) => source(path.join("lessons", course)),
  );
  const lessons = [
    ...courses.flatMap(({ lessons: list }) => list),
    ...(await loadAllLessons(source("lessons"))),
  ];
  const challenges = await loadAllChallenges(source("challenges"));
  const practice = await loadAllPracticeTasks(source("practice"));

  it("map every concept label onto the skill taxonomy", () => {
    const content = [...lessons, ...challenges, ...practice];
    const unmapped = content.flatMap((item) =>
      item.concepts
        .filter((concept) => skillForConcept(concept) === null)
        .map((c) => `${item.id}: ${c}`),
    );
    // A new concept label needs a home in packages/progress/src/skills.ts.
    expect(unmapped).toEqual([]);
  });

  it("give every hands-on lesson at least one skill", () => {
    for (const lesson of lessons) {
      expect(skillsForConcepts(lesson.concepts).length, lesson.id).toBeGreaterThan(0);
    }
  });

  it("name a real skill and a real related lesson for every practice task", () => {
    for (const task of practice) {
      expect(isSkillId(task.skill), `${task.id} skill ${task.skill}`).toBe(true);
      // The task's concepts include its own skill, so the dashboard counts it there too.
      expect(skillsForConcepts(task.concepts), task.id).toContain(task.skill);
      if (!task.related) continue;
      const { course, lesson } = task.related;
      const found = courses
        .find((loaded) => loaded.course.slug === course)
        ?.lessons.find((candidate) => candidate.slug === lesson);
      expect(found, `${task.id} → ${course}/${lesson}`).toBeDefined();
    }
  });

  it("cover at least eight skills with practice", () => {
    expect(new Set(practice.map((task) => task.skill)).size).toBeGreaterThanOrEqual(8);
  });
});
