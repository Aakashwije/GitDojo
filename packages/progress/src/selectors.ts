import { type CourseLessonSummary, type CourseOutline } from "@gitdojo/shared-types";
import { indexLessons, type ProgressCatalog } from "./catalog";
import { type LocalProgress } from "./model";

export function completedLessonIds(progress: LocalProgress): Set<string> {
  return new Set(Object.keys(progress.completedLessons));
}

export function completedChallengeIds(progress: LocalProgress): Set<string> {
  return new Set(Object.keys(progress.completedChallenges));
}

export interface CourseProgress {
  completedCount: number;
  total: number;
  /** Whole percent, 0–100. */
  percent: number;
}

/**
 * A course's completion, derived from completed lessons and the course's current lesson list,
 * never stored. Completions of lessons that were removed from the course do not count.
 */
export function courseProgress(
  course: Pick<CourseOutline, "lessons">,
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

/** The first lesson of a course not completed yet, or `null` when the whole course is done. */
export function nextLessonToStudy(
  course: Pick<CourseOutline, "lessons">,
  completed: ReadonlySet<string>,
): CourseLessonSummary | null {
  return course.lessons.find((lesson) => !completed.has(lesson.id)) ?? null;
}

export interface ContinueTarget {
  course: CourseOutline;
  lesson: CourseLessonSummary;
  /**
   * `resume`: the last lesson visited, not finished yet. `next`: the next unfinished lesson after
   * finished work. `start`: nothing done yet, the very first lesson.
   */
  reason: "resume" | "next" | "start";
}

function firstOpenLesson(
  courses: readonly CourseOutline[],
  completed: ReadonlySet<string>,
  startAt = 0,
): { course: CourseOutline; lesson: CourseLessonSummary } | null {
  for (let offset = 0; offset < courses.length; offset += 1) {
    const course = courses[(startAt + offset) % courses.length];
    if (!course) continue;
    const lesson = nextLessonToStudy(course, completed);
    if (lesson) return { course, lesson };
  }
  return null;
}

/**
 * Where "Continue learning" should go. Always a lesson that exists in the current content: the
 * last visited lesson is looked up by its stable id (wherever it now lives), so a renamed slug,
 * a moved lesson or a removed course falls back to the next unfinished lesson. `null` once every
 * course is complete.
 */
export function continueLearning(
  progress: LocalProgress,
  courses: readonly CourseOutline[],
): ContinueTarget | null {
  const completed = completedLessonIds(progress);
  const last = progress.lastLesson;
  if (last) {
    const index = (() => {
      const exact = courses.findIndex(
        (course) =>
          course.id === last.courseId && course.lessons.some((l) => l.id === last.lessonId),
      );
      return exact !== -1
        ? exact
        : courses.findIndex((course) => course.lessons.some((l) => l.id === last.lessonId));
    })();
    const course = courses[index];
    const lesson = course?.lessons.find((candidate) => candidate.id === last.lessonId);
    if (course && lesson) {
      if (!completed.has(lesson.id)) return { course, lesson, reason: "resume" };
      const next = firstOpenLesson(courses, completed, index);
      return next ? { ...next, reason: "next" } : null;
    }
  }
  const first = firstOpenLesson(courses, completed);
  if (!first) return null;
  const started = courses.some((course) => course.lessons.some((l) => completed.has(l.id)));
  return { ...first, reason: started ? "next" : "start" };
}

export interface CommandUsage {
  command: string;
  uses: number;
  successes: number;
}

export interface CommandSummary {
  uses: number;
  successes: number;
  /** Most used first, then alphabetical. */
  commands: CommandUsage[];
}

export function commandSummary(progress: LocalProgress): CommandSummary {
  const commands = Object.entries(progress.commandStats)
    .map(([command, stat]) => ({ command, uses: stat.uses, successes: stat.successes }))
    .sort((a, b) => b.uses - a.uses || a.command.localeCompare(b.command));
  return {
    uses: commands.reduce((sum, command) => sum + command.uses, 0),
    successes: commands.reduce((sum, command) => sum + command.successes, 0),
    commands,
  };
}

/** Content key → number of distinct hints revealed there. */
export function hintsUsed(progress: LocalProgress): Record<string, number> {
  return Object.fromEntries(
    Object.entries(progress.revealedHints).map(([key, hints]) => [key, hints.length]),
  );
}

export function totalHintsUsed(progress: LocalProgress): number {
  return Object.values(progress.revealedHints).reduce((sum, hints) => sum + hints.length, 0);
}

export interface ActivityItem {
  kind: "lesson" | "challenge";
  id: string;
  /** The current title, or the id when the content no longer exists. */
  title: string;
  completedAt: number;
  xp: number;
  /** Where the lesson lives now; absent for standalone lessons and removed content. */
  course?: { slug: string; title: string };
  /** The lesson's slug in that course. */
  lessonSlug?: string;
  /** The content still exists, so it can be linked to. */
  available: boolean;
  migrated: boolean;
}

/** Completed lessons and challenges, most recent first. */
export function recentActivity(
  progress: LocalProgress,
  catalog: ProgressCatalog,
  limit = 5,
): ActivityItem[] {
  const lessons = indexLessons(catalog);
  const challenges = new Map(catalog.challenges.map((challenge) => [challenge.id, challenge]));
  const items: ActivityItem[] = [];
  for (const [id, record] of Object.entries(progress.completedLessons)) {
    const lesson = lessons.get(id);
    items.push({
      kind: "lesson",
      id,
      title: lesson?.title ?? id,
      completedAt: record.completedAt,
      xp: record.xp,
      ...(lesson?.course
        ? {
            course: { slug: lesson.course.slug, title: lesson.course.title },
            lessonSlug: lesson.slug,
          }
        : {}),
      available: lesson !== undefined,
      migrated: record.migrated === true,
    });
  }
  for (const [id, record] of Object.entries(progress.completedChallenges)) {
    const challenge = challenges.get(id);
    items.push({
      kind: "challenge",
      id,
      title: challenge?.title ?? id,
      completedAt: record.completedAt,
      xp: record.xp,
      available: challenge !== undefined,
      migrated: record.migrated === true,
    });
  }
  return items
    .sort((a, b) => b.completedAt - a.completedAt || a.title.localeCompare(b.title))
    .slice(0, limit);
}
