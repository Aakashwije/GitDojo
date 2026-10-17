import { type CourseLessonSummary, type CourseOutline } from "@gitdojo/shared-types";
import { type ProgressCatalog } from "./catalog";
import { contentKey, type LocalProgress } from "./model";
import { nextLessonToStudy } from "./selectors";
import { MASTERY_RULE, skillProgress, skillsForConcepts, type SkillProgress } from "./skills";

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

/** The most useful next item for one skill, given where the learner is with it. */
export interface SkillAction {
  kind: "lesson" | "challenge" | "practice";
  title: string;
  /** A route that exists: `/learn/<course>/<lesson>`, `/challenges/<id>` or `/practice/<task>`. */
  href: string;
  /** Why this item, in a few words. */
  reason: string;
}

function lessonAction(
  found: { course: CourseOutline; lesson: CourseLessonSummary } | null,
  reason: string,
): SkillAction | null {
  return found
    ? {
        kind: "lesson",
        title: found.lesson.title,
        href: lessonHref(found.course, found.lesson),
        reason,
      }
    : null;
}

function practiceAction(
  task: { id: string; title: string } | null,
  reason: string,
): SkillAction | null {
  return task
    ? { kind: "practice", title: task.title, href: `/practice/${task.id}`, reason }
    : null;
}

/** An unsolved challenge, or course challenge lesson, teaching `skill`: both count as unguided. */
function unguidedFor(
  skill: string,
  catalog: ProgressCatalog,
  progress: LocalProgress,
): SkillAction | null {
  const challenge = catalog.challenges.find(
    (candidate) =>
      progress.completedChallenges[candidate.id] === undefined &&
      skillsForConcepts(
        catalog.concepts[contentKey({ kind: "challenge", id: candidate.id })] ?? [],
      ).includes(skill),
  );
  if (challenge) {
    return {
      kind: "challenge",
      title: challenge.title,
      href: `/challenges/${challenge.id}`,
      reason: "Solve it without step-by-step help",
    };
  }
  for (const course of catalog.courses) {
    for (const lesson of course.lessons) {
      if (lesson.type !== "challenge" || progress.completedLessons[lesson.id]) continue;
      const concepts = catalog.concepts[contentKey({ kind: "lesson", id: lesson.id })] ?? [];
      if (skillsForConcepts(concepts).includes(skill)) {
        return lessonAction({ course, lesson }, "Solve it without step-by-step help");
      }
    }
  }
  return null;
}

/**
 * For every skill, the one item that moves it on, or `null` when nothing is left to suggest:
 * a first hands-on lesson for a skill not practiced yet; for a practiced skill, the unguided work
 * {@link MASTERY_RULE} still asks for, then more hands-on items; for a mastered one, a Practice
 * task to keep it sharp. Completed content is never suggested.
 */
export function skillNextActions(
  progress: LocalProgress,
  catalog: ProgressCatalog,
  skills: readonly SkillProgress[] = skillProgress(progress, catalog),
): Map<string, SkillAction | null> {
  const completed = new Set(Object.keys(progress.completedLessons));
  const solved = new Set(Object.keys(progress.completedPractice));
  return new Map(
    skills.map((entry) => {
      const id = entry.skill.id;
      const lesson = () => lessonAction(firstLessonFor(id, catalog, completed), "Next lesson");
      const practice = (reason: string) => practiceAction(practiceFor(id, catalog, solved), reason);
      let action: SkillAction | null;
      if (entry.status === "untouched" || entry.status === "studied") {
        action =
          lessonAction(firstLessonFor(id, catalog, completed), "Start hands-on") ??
          practice("Start hands-on") ??
          unguidedFor(id, catalog, progress);
      } else if (entry.status === "practiced") {
        action =
          entry.unguided < MASTERY_RULE.unguided
            ? (practice("Solve it without step-by-step help") ?? unguidedFor(id, catalog, progress))
            : null;
        action ??= lesson() ?? practice("Practice it again") ?? unguidedFor(id, catalog, progress);
      } else {
        action = practice("Keep it sharp");
      }
      return [id, action] as const;
    }),
  );
}
