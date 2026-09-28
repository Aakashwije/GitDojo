import { type CourseLessonSummary, type CourseOutline } from "@gitdojo/shared-types";

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

export interface CourseProgress {
  completedCount: number;
  total: number;
  /** Whole percent, 0–100. */
  percent: number;
}

export function courseProgress(
  course: CourseOutline,
  completed: ReadonlySet<string>,
): CourseProgress {
  const total = course.lessons.length;
  const completedCount = course.lessons.filter((lesson) => completed.has(lesson.id)).length;
  return {
    completedCount,
    total,
    percent: total === 0 ? 0 : Math.round((completedCount / total) * 100),
  };
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

/** The first lesson not completed yet, or `null` when the whole course is done. */
export function nextLessonToStudy(
  course: CourseOutline,
  completed: ReadonlySet<string>,
): CourseLessonSummary | null {
  return course.lessons.find((lesson) => !completed.has(lesson.id)) ?? null;
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
