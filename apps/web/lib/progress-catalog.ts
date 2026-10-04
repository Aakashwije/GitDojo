import "server-only";

import { toCourseOutline } from "@gitdojo/lesson-engine";
import { type ProgressCatalog } from "@gitdojo/progress";
import { lessonTypeOf } from "@gitdojo/shared-types";
import { loadChallenges } from "./content";
import { DEMO_LESSON, loadAllCourses, loadLesson } from "./lessons";

let catalog: Promise<ProgressCatalog> | null = null;

/**
 * Ids, titles, types and course structure of everything that can be completed. Built from the
 * content at build time and sent to the client, where progress uses it for migration, course
 * completion and "Continue learning".
 */
export function loadProgressCatalog(): Promise<ProgressCatalog> {
  catalog ??= (async () => {
    const [courses, demo, challenges] = await Promise.all([
      loadAllCourses(),
      loadLesson(DEMO_LESSON),
      loadChallenges(),
    ]);
    return {
      courses: courses.map(toCourseOutline),
      lessons: [{ id: demo.id, title: demo.title, type: lessonTypeOf(demo) }],
      challenges: challenges.map((challenge) => ({ id: challenge.id, title: challenge.title })),
    };
  })();
  return catalog;
}
