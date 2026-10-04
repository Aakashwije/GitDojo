import "server-only";

import {
  loadAllCourses as loadAllCoursesFromSource,
  loadCourse as loadCourseFromSource,
  loadLesson as loadLessonFromSource,
  type LoadedCourse,
} from "@gitdojo/lesson-engine";
import {
  createDirectoryCourseSource,
  createDirectoryLessonSource,
} from "@gitdojo/lesson-engine/node";
import { type LessonDefinition } from "@gitdojo/shared-types";
import path from "node:path";
import { CONTENT_DIR } from "./content";

const LESSONS_DIR = path.join(CONTENT_DIR, "lessons");

/** The standalone five-minute lesson at /learn/demo. */
export const DEMO_LESSON = "first-commit";
const courses = createDirectoryCourseSource(path.join(CONTENT_DIR, "courses"));
const lessonsFor = (course: string) => createDirectoryLessonSource(path.join(LESSONS_DIR, course));

/** A standalone lesson in `content/lessons/`, such as the demo. */
export function loadLesson(slug: string): Promise<LessonDefinition> {
  return loadLessonFromSource(slug, createDirectoryLessonSource(LESSONS_DIR));
}

export function loadCourse(slug: string): Promise<LoadedCourse> {
  return loadCourseFromSource(slug, courses, lessonsFor);
}

/** Every course, in display order. */
export function loadAllCourses(): Promise<LoadedCourse[]> {
  return loadAllCoursesFromSource(courses, lessonsFor);
}
