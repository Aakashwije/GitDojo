import { type CourseOutline, type LessonType } from "@gitdojo/shared-types";

/** A lesson outside any course, such as the five-minute demo. */
export interface StandaloneLessonInfo {
  id: string;
  title: string;
  type: LessonType;
}

export interface ChallengeInfo {
  id: string;
  title: string;
}

/**
 * The content the learner can make progress on, built from the YAML content at build time.
 * Progress stores only ids; titles, types and course structure always come from here, so
 * renamed or removed content never breaks saved progress.
 */
export interface ProgressCatalog {
  courses: CourseOutline[];
  lessons: StandaloneLessonInfo[];
  challenges: ChallengeInfo[];
}

export interface CatalogLesson {
  id: string;
  slug: string;
  title: string;
  type: LessonType;
  /** Absent for standalone lessons. */
  course?: { id: string; slug: string; title: string };
}

/** Lesson id → where it lives now. Course lessons win over standalone ones with the same id. */
export function indexLessons(catalog: ProgressCatalog): Map<string, CatalogLesson> {
  const index = new Map<string, CatalogLesson>();
  for (const lesson of catalog.lessons) {
    index.set(lesson.id, {
      id: lesson.id,
      slug: lesson.id,
      title: lesson.title,
      type: lesson.type,
    });
  }
  for (const course of catalog.courses) {
    for (const lesson of course.lessons) {
      index.set(lesson.id, {
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        type: lesson.type,
        course: { id: course.id, slug: course.slug, title: course.title },
      });
    }
  }
  return index;
}
