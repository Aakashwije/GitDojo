import {
  completedLessonIds,
  indexLessons,
  solvedPracticeIds,
  type LocalProgress,
  type ProgressCatalog,
} from "@gitdojo/progress";
import { AWARDS, type AwardKey } from "@/lib/certificates/awards";

export interface AwardRequirement {
  kind: "lesson" | "practice";
  id: string;
  /** The current title, or the id if the content is not in the catalog. */
  title: string;
  /** Where to do it; absent when the content is not in the catalog. */
  href?: string;
}

export interface AwardProgress {
  done: number;
  total: number;
  remaining: number;
  /** Whole percent, 0–100. */
  percent: number;
  /** The first requirement not recorded yet, lessons in award order before Practice tasks. */
  next: AwardRequirement | null;
}

/**
 * How far this browser's progress is towards an award's fixed criteria. Only a guide: the server
 * checks the account's own completions when a certificate is issued.
 */
export function awardProgress(
  key: AwardKey,
  progress: LocalProgress,
  catalog: ProgressCatalog,
): AwardProgress {
  const award = AWARDS[key];
  const lessons = completedLessonIds(progress);
  const practice = solvedPracticeIds(progress);
  const done =
    award.lessons.filter((id) => lessons.has(id)).length +
    award.practice.filter((id) => practice.has(id)).length;
  const total = award.lessons.length + award.practice.length;

  let next: AwardRequirement | null = null;
  const lessonId = award.lessons.find((id) => !lessons.has(id));
  if (lessonId) {
    const lesson = indexLessons(catalog).get(lessonId);
    next = {
      kind: "lesson",
      id: lessonId,
      title: lesson?.title ?? lessonId,
      ...(lesson?.course ? { href: `/learn/${lesson.course.slug}/${lesson.slug}` } : {}),
    };
  } else {
    const taskId = award.practice.find((id) => !practice.has(id));
    const task = catalog.practice.find((candidate) => candidate.id === taskId);
    if (taskId) {
      next = {
        kind: "practice",
        id: taskId,
        title: task?.title ?? taskId,
        ...(task ? { href: `/practice/${taskId}` } : {}),
      };
    }
  }
  return {
    done,
    total,
    remaining: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    next,
  };
}
