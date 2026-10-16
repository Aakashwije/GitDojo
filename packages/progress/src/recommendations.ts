import { type CourseLessonSummary, type CourseOutline } from "@gitdojo/shared-types";
import { type ProgressCatalog } from "./catalog";
import { contentKey, type LocalProgress } from "./model";
import { nextLessonToStudy } from "./selectors";
import { skillProgress, skillsForConcepts, type SkillProgress } from "./skills";

export interface Recommendation {
  /** Stable across renders: the content key it points at. */
  id: string;
  kind: "lesson" | "practice";
  title: string;
  /** A route that exists: `/learn/<course>/<lesson>` or `/practice/<task>`. */
  href: string;
  /** One short sentence: why this, now. */
  reason: string;
  /** The skill it builds, when it was chosen for one. */
  skill?: string;
  /** The course it belongs to, for lessons. */
  course?: { slug: string; title: string };
}

function lessonHref(
  course: Pick<CourseOutline, "slug">,
  lesson: Pick<CourseLessonSummary, "slug">,
) {
  return `/learn/${course.slug}/${lesson.slug}`;
}

function lessonRecommendation(
  course: CourseOutline,
  lesson: CourseLessonSummary,
  reason: string,
  skill?: string,
): Recommendation {
  return {
    id: contentKey({ kind: "lesson", id: lesson.id }),
    kind: "lesson",
    title: lesson.title,
    href: lessonHref(course, lesson),
    reason,
    course: { slug: course.slug, title: course.title },
    ...(skill ? { skill } : {}),
  };
}

/** The course to carry on with, and its next lesson, if the learner has started one. */
function continueCourse(
  progress: LocalProgress,
  catalog: ProgressCatalog,
  completed: ReadonlySet<string>,
): Recommendation | null {
  const last = progress.lastLesson;
  if (last && !completed.has(last.lessonId)) {
    for (const course of catalog.courses) {
      const lesson = course.lessons.find((candidate) => candidate.id === last.lessonId);
      if (lesson) return lessonRecommendation(course, lesson, "Pick up where you left off");
    }
  }
  const started = catalog.courses.filter((course) =>
    course.lessons.some((lesson) => completed.has(lesson.id)),
  );
  // The course visited last first, then the first started course in course order.
  const preferred =
    started.find((course) => course.id === last?.courseId) ??
    started.find((course) => nextLessonToStudy(course, completed) !== null);
  for (const course of preferred ? [preferred, ...started] : started) {
    const next = nextLessonToStudy(course, completed);
    if (next) return lessonRecommendation(course, next, "Continue the course you started");
  }
  if (completed.size === 0 && Object.keys(progress.completedChallenges).length === 0) {
    const first = catalog.courses[0];
    const lesson = first ? nextLessonToStudy(first, completed) : null;
    if (first && lesson) return lessonRecommendation(first, lesson, "Start at the beginning");
  }
  return null;
}

/** The first unfinished hands-on lesson teaching `skill`, in course order. */
function firstLessonFor(
  skill: string,
  catalog: ProgressCatalog,
  completed: ReadonlySet<string>,
): { course: CourseOutline; lesson: CourseLessonSummary } | null {
  for (const course of catalog.courses) {
    for (const lesson of course.lessons) {
      if (lesson.type === "concept" || completed.has(lesson.id)) continue;
      const concepts = catalog.concepts[contentKey({ kind: "lesson", id: lesson.id })] ?? [];
      if (skillsForConcepts(concepts).includes(skill)) return { course, lesson };
    }
  }
  return null;
}

function practiceFor(skill: string, catalog: ProgressCatalog, solved: ReadonlySet<string>) {
  return catalog.practice.find((task) => task.skill === skill && !solved.has(task.id)) ?? null;
}

/**
 * A few next steps, most relevant first, deterministic for the same progress and content:
 *
 * 1. the lesson to resume, or the next lesson of a course the learner has started (or the very
 *    first lesson, for someone who has done nothing yet);
 * 2. a first hands-on lesson, or a practice task, for skills not practiced yet;
 * 3. practice tasks for skills practiced but not mastered.
 *
 * Completed content is never recommended. Returns fewer (or none) when little is left.
 */
export function recommendNextSteps(
  progress: LocalProgress,
  catalog: ProgressCatalog,
  { limit = 3 }: { limit?: number } = {},
): Recommendation[] {
  const completed = new Set(Object.keys(progress.completedLessons));
  const solved = new Set(Object.keys(progress.completedPractice));
  const picks: Recommendation[] = [];
  const add = (recommendation: Recommendation | null) => {
    if (!recommendation || picks.length >= limit) return;
    if (picks.some((pick) => pick.id === recommendation.id)) return;
    picks.push(recommendation);
  };

  add(continueCourse(progress, catalog, completed));
  const skills = skillProgress(progress, catalog);
  const byStatus = (statuses: SkillProgress["status"][]) =>
    skills.filter((entry) => statuses.includes(entry.status));

  for (const { skill } of byStatus(["untouched", "studied"])) {
    const lesson = firstLessonFor(skill.id, catalog, completed);
    if (lesson) {
      add(
        lessonRecommendation(
          lesson.course,
          lesson.lesson,
          `Try your first ${skill.phrase} task`,
          skill.id,
        ),
      );
      continue;
    }
    const task = practiceFor(skill.id, catalog, solved);
    if (task) {
      add({
        id: contentKey({ kind: "practice", id: task.id }),
        kind: "practice",
        title: task.title,
        href: `/practice/${task.id}`,
        reason: `Try your first ${skill.phrase} task`,
        skill: skill.id,
      });
    }
  }
  for (const { skill } of byStatus(["practiced"])) {
    const task = practiceFor(skill.id, catalog, solved);
    if (!task) continue;
    add({
      id: contentKey({ kind: "practice", id: task.id }),
      kind: "practice",
      title: task.title,
      href: `/practice/${task.id}`,
      reason: `More ${skill.phrase} practice, without step-by-step help`,
      skill: skill.id,
    });
  }
  return picks;
}
