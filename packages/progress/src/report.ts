import { type ProgressCatalog } from "./catalog";
import { withRemoteCounters, type LocalProgress } from "./model";
import { recommendNextSteps } from "./recommendations";
import {
  commandSummary,
  completedChallengeIds,
  completedLessonIds,
  courseProgress,
  recentActivity,
  solvedPracticeIds,
} from "./selectors";
import { MASTERY_RULE, skillProgress } from "./skills";

/** The name shown when the learner gives none. */
export const DEFAULT_LEARNER_NAME = "GitDojo Learner";

/** Longest learner name the report shows; anything longer is cut, never wrapped mid-word. */
export const MAX_LEARNER_NAME_LENGTH = 60;

export interface ReportStat {
  label: string;
  value: number;
  /** What the number counts, when it could be misread. */
  detail?: string;
}

export interface ReportCourse {
  title: string;
  completed: number;
  total: number;
  /** Whole percent, 0–100. */
  percent: number;
}

export interface ReportSkill {
  label: string;
  status: "practiced" | "mastered";
  /** Hands-on items finished for this skill, and how many exist. */
  handsOn: number;
  available: number;
}

export interface ReportActivity {
  kind: "Lesson" | "Challenge" | "Practice";
  title: string;
  /** Course title, for course lessons. */
  context?: string;
  completedAt: number;
  /** `+50 XP`, or `No XP` for practice. */
  reward: string;
}

export interface ReportNextStep {
  title: string;
  reason: string;
  /** An absolute URL to open the content, when the site's origin is known. */
  url?: string;
}

/**
 * Everything a printed progress report shows, built only from the learner's progress and the
 * content catalog. It never holds email addresses, account ids, device ids, session data, hint
 * lists or workspace files: there is no field for them, so they cannot leak into the PDF.
 * Sections with nothing in them are left out rather than filled with zeros.
 */
export interface ProgressReport {
  learnerName: string;
  /** ms since the epoch. */
  exportedAt: number;
  /** One or two plain sentences; never claims mastery the progress does not show. */
  summary: string;
  stats: ReportStat[];
  courses: ReportCourse[];
  skills: { practiced: ReportSkill[]; untouchedCount: number; masteryRule: string } | null;
  activity: ReportActivity[];
  commands: { command: string; uses: number; successes: number }[];
  nextSteps: ReportNextStep[];
}

export interface ReportOptions {
  /** Optional; blank or missing means {@link DEFAULT_LEARNER_NAME}. */
  learnerName?: string | null;
  /** ms since the epoch. */
  exportedAt: number;
  /** e.g. `https://gitdojo.dev`, to turn next steps into links. */
  origin?: string;
  /** How many recent completions to list (default 12). */
  activityLimit?: number;
}

/** Trimmed, single-spaced and capped; the default when nothing usable is left. */
export function normalizeLearnerName(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/\s+/g, " ").trim();
  if (clean === "") return DEFAULT_LEARNER_NAME;
  return clean.length > MAX_LEARNER_NAME_LENGTH
    ? `${clean.slice(0, MAX_LEARNER_NAME_LENGTH - 1).trimEnd()}…`
    : clean;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function summaryOf(
  lessons: number,
  challenges: number,
  practice: number,
  practiced: number,
  mastered: number,
): string {
  if (lessons + challenges + practice === 0) {
    return "No lessons, challenges or practice tasks are completed yet. This report fills in as you learn.";
  }
  const done = [
    lessons > 0 ? plural(lessons, "lesson") : null,
    challenges > 0 ? plural(challenges, "challenge") : null,
    practice > 0 ? plural(practice, "practice task") : null,
  ].filter((part) => part !== null);
  const list =
    done.length > 1 ? `${done.slice(0, -1).join(", ")} and ${done.at(-1) ?? ""}` : (done[0] ?? "");
  const skills =
    practiced === 0
      ? "No skill has hands-on practice yet."
      : mastered === 0
        ? `${plural(practiced, "skill")} practiced hands-on so far.`
        : `${plural(practiced, "skill")} practiced hands-on, ${String(mastered)} of them mastered.`;
  return `Completed ${list}. ${skills}`;
}

/** The report for `progress`, as the dashboard would show it today. */
export function buildProgressReport(
  own: LocalProgress,
  catalog: ProgressCatalog,
  { learnerName, exportedAt, origin, activityLimit = 12 }: ReportOptions,
): ProgressReport {
  // Counters are per device; like the dashboard, the report shows the account's totals.
  const progress = withRemoteCounters(own);
  const lessons = completedLessonIds(progress);
  const challenges = completedChallengeIds(progress);
  const practice = solvedPracticeIds(progress);
  const commands = commandSummary(progress);
  const skills = skillProgress(progress, catalog);
  const practiced = skills.filter((s) => s.status === "practiced" || s.status === "mastered");
  const mastered = practiced.filter((s) => s.status === "mastered");
  const courseLessons = catalog.courses.reduce((sum, course) => sum + course.lessons.length, 0);
  const courseLessonsDone = catalog.courses.reduce(
    (sum, course) => sum + courseProgress(course, lessons).completedCount,
    0,
  );

  const stats: ReportStat[] = [
    { label: "Total XP", value: progress.xp, detail: "from lessons and challenges" },
    {
      label: "Lessons completed",
      value: lessons.size,
      detail: `${String(courseLessonsDone)} of ${String(courseLessons)} course lessons`,
    },
    {
      label: "Challenges completed",
      value: challenges.size,
      detail: `of ${String(catalog.challenges.length)} challenges`,
    },
    {
      label: "Practice tasks solved",
      value: practice.size,
      detail: `of ${String(catalog.practice.length)} tasks · practice earns no XP`,
    },
  ];
  if (commands.uses > 0) {
    stats.push({
      label: "Git commands run",
      value: commands.uses,
      detail: `${String(commands.successes)} succeeded`,
    });
  }

  const absolute = (href: string) => (origin ? new URL(href, origin).toString() : undefined);
  return {
    learnerName: normalizeLearnerName(learnerName),
    exportedAt,
    summary: summaryOf(
      lessons.size,
      challenges.size,
      practice.size,
      practiced.length,
      mastered.length,
    ),
    stats,
    courses: catalog.courses.map((course) => {
      const value = courseProgress(course, lessons);
      return {
        title: course.title,
        completed: value.completedCount,
        total: value.total,
        percent: value.percent,
      };
    }),
    skills:
      practiced.length === 0
        ? null
        : {
            practiced: practiced.map((entry) => ({
              label: entry.skill.label,
              status: entry.status === "mastered" ? "mastered" : "practiced",
              handsOn: entry.handsOn,
              available: entry.available,
            })),
            untouchedCount: skills.length - practiced.length,
            masteryRule: `Practiced: at least one hands-on lesson, challenge or practice task finished. Mastered: ${String(MASTERY_RULE.handsOn)} or more, at least ${String(MASTERY_RULE.unguided)} of them without step-by-step help.`,
          },
    activity: recentActivity(progress, catalog, activityLimit).map((item) => ({
      kind:
        item.kind === "challenge" ? "Challenge" : item.kind === "practice" ? "Practice" : "Lesson",
      title: item.title,
      ...(item.course ? { context: item.course.title } : {}),
      completedAt: item.completedAt,
      reward: item.kind === "practice" ? "No XP" : `+${String(item.xp)} XP`,
    })),
    commands: commands.commands.slice(0, 8),
    nextSteps: recommendNextSteps(progress, catalog).map((step) => {
      const url = absolute(step.href);
      return { title: step.title, reason: step.reason, ...(url ? { url } : {}) };
    }),
  };
}
