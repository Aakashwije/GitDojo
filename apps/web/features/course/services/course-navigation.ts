import { courseProgress, nextLessonToStudy, type CourseProgress } from "@gitdojo/progress";
import { type CourseLessonSummary, type CourseOutline } from "@gitdojo/shared-types";

// Course completion is derived from completed lessons by the progress package.
export { courseProgress, nextLessonToStudy, type CourseProgress };

export type LessonStatus = "completed" | "current" | "upcoming";

export function courseHref(courseSlug: string): string {
  return `/learn/${courseSlug}`;
}

export function lessonHref(courseSlug: string, lessonSlug: string): string {
  return `/learn/${courseSlug}/${lessonSlug}`;
}

/** Lesson numbers are shown zero-padded, as in "03 Initialize a Repository". */
export function formatLessonNumber(number: number): string {
  return String(number).padStart(2, "0");
}

export interface LessonNeighbors {
  lesson: CourseLessonSummary;
  previous: CourseLessonSummary | null;
  next: CourseLessonSummary | null;
}

export function lessonNeighbors(course: CourseOutline, lessonSlug: string): LessonNeighbors | null {
  const index = course.lessons.findIndex((lesson) => lesson.slug === lessonSlug);
  const lesson = course.lessons[index];
  if (lesson === undefined) return null;
  return {
    lesson,
    previous: course.lessons[index - 1] ?? null,
    next: course.lessons[index + 1] ?? null,
  };
}

/**
 * Marker shown next to a lesson in the outline: ✓ once completed, → for the lesson being viewed
 * (or, outside a lesson, the next one to study), nothing otherwise.
 */
export function lessonStatus(
  lesson: CourseLessonSummary,
  completed: ReadonlySet<string>,
  currentId: string | null,
): LessonStatus {
  if (completed.has(lesson.id)) return "completed";
  return lesson.id === currentId ? "current" : "upcoming";
}
