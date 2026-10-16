import "server-only";

import { toCourseOutline } from "@gitdojo/lesson-engine";
import { contentKey, type ProgressCatalog } from "@gitdojo/progress";
import { lessonTypeOf } from "@gitdojo/shared-types";
import { loadChallenges, loadPracticeTasks } from "./content";
import { DEMO_LESSON, loadAllCourses, loadLesson } from "./lessons";

let catalog: Promise<ProgressCatalog> | null = null;

/**
 * Ids, titles, types and course structure of everything that can be completed. Built from the
 * content at build time and sent to the client, where progress uses it for migration, course
 * completion and "Continue learning".
 */
export function loadProgressCatalog(): Promise<ProgressCatalog> {
  catalog ??= (async () => {
    const [courses, demo, challenges, practice] = await Promise.all([
      loadAllCourses(),
      loadLesson(DEMO_LESSON),
      loadChallenges(),
      loadPracticeTasks(),
    ]);
    // Concept tags for the dashboard's skills. Course lessons win over a standalone lesson
    // with the same id, as everywhere else in the catalog.
    const concepts: Record<string, string[]> = {
      [contentKey({ kind: "lesson", id: demo.id })]: demo.concepts,
    };
    for (const { lessons } of courses) {
      for (const lesson of lessons)
        concepts[contentKey({ kind: "lesson", id: lesson.id })] = lesson.concepts;
    }
    for (const challenge of challenges) {
      concepts[contentKey({ kind: "challenge", id: challenge.id })] = challenge.concepts;
    }
    for (const task of practice)
      concepts[contentKey({ kind: "practice", id: task.id })] = task.concepts;
    return {
      courses: courses.map(toCourseOutline),
      lessons: [{ id: demo.id, title: demo.title, type: lessonTypeOf(demo) }],
      challenges: challenges.map((challenge) => ({ id: challenge.id, title: challenge.title })),
      practice: practice.map((task) => ({
        id: task.id,
        title: task.title,
        skill: task.skill,
        difficulty: task.difficulty,
      })),
      concepts,
    };
  })();
  return catalog;
}
