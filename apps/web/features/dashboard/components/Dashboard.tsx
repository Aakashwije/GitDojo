"use client";

import {
  commandSummary,
  completedChallengeIds,
  completedLessonIds,
  continueLearning,
  courseProgress,
  recentActivity,
  recommendNextSteps,
  skillNextActions,
  skillProgress,
  solvedPracticeIds,
  withRemoteCounters,
  type ActivityItem,
  type LocalProgress,
  type ProgressCatalog,
  type Recommendation,
  type SkillProgress,
  type SkillStatus,
} from "@gitdojo/progress";
import { cn } from "@gitdojo/ui";
import {
  BookOpen,
  Boxes,
  Compass,
  Flag,
  History,
  SquareTerminal,
  Star,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { lessonHref } from "@/features/course";
import { challengeHref } from "@/features/challenges";
import { formatRelativeTime, formatTimestamp } from "@/lib/time";
import { ProgressManagement, useProgressStore } from "@/features/progress";
import { CertificateAwards } from "@/features/certificates";
import { ActivityCalendar } from "./ActivityCalendar";
import { CommandUsage } from "./CommandUsage";
import { LearningJourney } from "./LearningJourney";
import { SectionHeading } from "./SectionHeading";
import { SkillMap } from "./SkillMap";

/** True for a learner who has not done anything yet. */
function isNewLearner(progress: LocalProgress): boolean {
  return (
    Object.keys(progress.completedLessons).length === 0 &&
    Object.keys(progress.completedChallenges).length === 0 &&
    Object.keys(progress.completedPractice).length === 0 &&
    Object.keys(progress.commandStats).length === 0 &&
    progress.playgroundSessions === 0 &&
    progress.lastLesson === undefined
  );
}

export function Dashboard({ catalog }: { catalog: ProgressCatalog }) {
  const progress = useProgressStore((state) => state.progress);
  const persistence = useProgressStore((state) => state.persistence);
  const mode = useProgressStore((state) => state.mode);

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Dashboard</h1>
      <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
        {mode === "account"
          ? "Your progress, saved to your account."
          : mode === "account-unavailable"
            ? "Your account progress couldn't be loaded. Showing this visit only."
            : persistence?.mode === "memory"
              ? "Your progress for this visit. This browser is not letting GitDojo save it."
              : "Your progress, saved in this browser. No account needed."}
      </p>

      {progress === null ? (
        <div
          aria-busy="true"
          aria-label="Loading progress"
          data-testid="dashboard-loading"
          className="mt-10 grid gap-4 md:grid-cols-3"
        >
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-panel" />
          ))}
        </div>
      ) : (
        <DashboardContent progress={progress} catalog={catalog} />
      )}
    </main>
  );
}

function DashboardContent({
  progress: own,
  catalog,
}: {
  progress: LocalProgress;
  catalog: ProgressCatalog;
}) {
  const mode = useProgressStore((state) => state.mode);
  // Counters are stored per device; the learner's totals include their other devices'.
  const progress = withRemoteCounters(own);
  const lessons = completedLessonIds(progress);
  const challenges = completedChallengeIds(progress);
  const practice = solvedPracticeIds(progress);
  const commands = commandSummary(progress);
  const target = continueLearning(progress, catalog.courses);
  const courseLessons = catalog.courses.reduce((sum, course) => sum + course.lessons.length, 0);
  const courseLessonsDone = catalog.courses.reduce(
    (sum, course) => sum + courseProgress(course, lessons).completedCount,
    0,
  );
  const activity = recentActivity(progress, catalog, 6);
  const fresh = isNewLearner(progress);
  const skills = skillProgress(progress, catalog);
  const skillActions = skillNextActions(progress, catalog, skills);
  // The journey already shows where to carry on; the list adds what comes after it.
  const continueHref = target ? lessonHref(target.course.slug, target.lesson.slug) : null;
  const nextSteps = recommendNextSteps(progress, catalog, { limit: 4 })
    .filter((step) => step.href !== continueHref)
    .slice(0, 3);
  const announcement = useProgressAnnouncement(skills, catalog, lessons);

  return (
    <div data-testid="dashboard" className="mt-10 space-y-10">
      <LearningJourney progress={progress} catalog={catalog} fresh={fresh} />

      <section aria-labelledby="totals-heading">
        <h2 id="totals-heading" className="sr-only">
          Totals
        </h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat icon={Star} label="Total XP" value={progress.xp} testId="stat-xp" />
          <Stat
            icon={BookOpen}
            label="Lessons completed"
            value={lessons.size}
            detail={`${String(courseLessonsDone)} of ${String(courseLessons)} course lessons`}
            testId="stat-lessons"
          />
          <Stat
            icon={Flag}
            label="Challenges completed"
            value={challenges.size}
            detail={`of ${String(catalog.challenges.length)} challenges`}
            testId="stat-challenges"
          />
          <Stat
            icon={Target}
            label="Practice tasks solved"
            value={practice.size}
            detail={`of ${String(catalog.practice.length)} tasks · no XP`}
            testId="stat-practice"
          />
          <Stat
            icon={SquareTerminal}
            label="Commands used"
            value={commands.uses}
            detail={
              commands.uses === 0 ? "Git commands run" : `${String(commands.successes)} succeeded`
            }
            testId="stat-commands"
          />
          <Stat
            icon={Boxes}
            label="Playground sessions"
            value={progress.playgroundSessions}
            testId="stat-playground"
          />
        </dl>
      </section>

      <NextSteps steps={nextSteps} />

      <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-3">
        <ActivityCalendar
          progress={progress}
          account={mode === "account"}
          start={
            target
              ? {
                  href: continueHref ?? "/learn",
                  label: `${target.reason === "start" ? "Start" : "Continue"} with ${target.lesson.title}`,
                }
              : null
          }
        />

        <section aria-labelledby="activity-heading">
          <SectionHeading id="activity-heading" icon={History}>
            Recent activity
          </SectionHeading>
          {activity.length === 0 ? (
            <p className="mt-4 text-small text-fg-muted">
              Completed lessons, challenges and practice tasks will appear here.
            </p>
          ) : (
            <ol className="mt-4 space-y-2" data-testid="recent-activity">
              {activity.map((item) => (
                <ActivityRow key={`${item.kind}:${item.id}`} item={item} />
              ))}
            </ol>
          )}
        </section>

        <CommandUsage summary={commands} />
      </div>

      <SkillMap skills={skills} actions={skillActions} />

      <CertificateAwards progress={progress} catalog={catalog} />
      <ProgressManagement />
      <p role="status" className="sr-only" data-testid="dashboard-announcement">
        {announcement}
      </p>
    </div>
  );
}

/**
 * A short message when a skill is newly practiced or mastered, or a course completed, while the
 * dashboard is open (another tab, or a sync). One polite region, empty until something changes.
 */
function useProgressAnnouncement(
  skills: SkillProgress[],
  catalog: ProgressCatalog,
  lessons: ReadonlySet<string>,
): string {
  const statuses = new Map(skills.map((entry) => [entry.skill.id, entry.status]));
  const finished = catalog.courses
    .filter((course) => {
      const value = courseProgress(course, lessons);
      return value.total > 0 && value.completedCount === value.total;
    })
    .map((course) => course.id);
  const snapshot = `${[...statuses].join()}|${finished.join()}`;
  const [seen, setSeen] = useState({ snapshot, statuses, finished, message: "" });
  if (seen.snapshot === snapshot) return seen.message;

  const RANK: Record<SkillStatus, number> = { untouched: 0, studied: 1, practiced: 2, mastered: 3 };
  const news = [
    ...catalog.courses
      .filter((course) => finished.includes(course.id) && !seen.finished.includes(course.id))
      .map((course) => `${course.title} complete.`),
    ...skills
      .filter((entry) => {
        const before = seen.statuses.get(entry.skill.id) ?? "untouched";
        return (
          (entry.status === "practiced" || entry.status === "mastered") &&
          RANK[entry.status] > RANK[before]
        );
      })
      .map((entry) => `${entry.skill.label}: now ${STATUS_WORDS[entry.status]}.`),
  ];
  // Cleared when nothing new happened, so an old message is never left behind to be re-read.
  const message = news.join(" ");
  setSeen({ snapshot, statuses, finished, message });
  return message;
}

const STATUS_WORDS: Record<SkillStatus, string> = {
  untouched: "not started",
  studied: "read about",
  practiced: "practiced",
  mastered: "mastered",
};

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail?: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <dt className="flex items-center gap-2 text-caption text-fg-muted">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 font-mono text-h2 font-semibold text-fg" data-testid={testId}>
        {value.toLocaleString("en")}
      </dd>
      {detail ? <dd className="mt-1 text-caption text-fg-muted">{detail}</dd> : null}
    </div>
  );
}

function activityHref(item: ActivityItem): string | null {
  if (!item.available) return null;
  if (item.kind === "challenge") return challengeHref(item.id);
  if (item.kind === "practice") return `/practice/${item.id}`;
  if (item.course && item.lessonSlug) return lessonHref(item.course.slug, item.lessonSlug);
  return "/learn/demo";
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const href = activityHref(item);
  const Icon = item.kind === "challenge" ? Flag : item.kind === "practice" ? Target : BookOpen;
  const kindLabel =
    item.kind === "challenge" ? "Challenge" : item.kind === "practice" ? "Practice" : "Lesson";
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border-subtle bg-panel px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small text-fg">
          <span className="sr-only">{kindLabel}: </span>
          {href ? (
            <Link href={href} className="hover:underline">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </p>
        <p className="text-caption text-fg-muted">
          {item.course
            ? `${item.course.title} · `
            : item.kind !== "lesson"
              ? `${kindLabel} · `
              : ""}
          {item.migrated ? (
            "Completed earlier"
          ) : (
            <time
              dateTime={new Date(item.completedAt).toISOString()}
              title={formatTimestamp(item.completedAt / 1000)}
            >
              {formatRelativeTime(item.completedAt / 1000)}
            </time>
          )}
          {item.available ? null : " · no longer available"}
        </p>
      </div>
      {item.kind === "practice" ? (
        <span className="text-caption text-fg-muted">Practice · no XP</span>
      ) : (
        <span
          className={cn("font-mono text-caption", item.xp > 0 ? "text-success" : "text-fg-muted")}
        >
          +{item.xp} XP
        </span>
      )}
    </li>
  );
}

function NextSteps({ steps }: { steps: Recommendation[] }) {
  return (
    <section aria-labelledby="next-steps-heading" data-testid="next-steps">
      <SectionHeading id="next-steps-heading" icon={Compass}>
        Recommended next
      </SectionHeading>
      {steps.length === 0 ? (
        <p className="mt-4 text-small text-fg-muted" data-testid="next-steps-empty">
          You have done everything we would recommend next.{" "}
          <Link href="/practice" className="text-accent hover:underline">
            Practice again
          </Link>{" "}
          to keep your skills sharp.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                data-testid="next-step"
                data-kind={step.kind}
                className="flex h-full flex-col rounded-lg border border-border-subtle bg-panel p-4 transition-[border-color,transform] duration-150 ease-out hover:border-border-strong motion-safe:hover:-translate-y-0.5"
              >
                <span className="text-caption text-fg-muted">{step.reason}</span>
                <span className="mt-1 text-small font-semibold text-fg">{step.title}</span>
                <span className="mt-auto pt-2 text-caption text-fg-muted">
                  {step.kind === "practice" ? "Practice task" : (step.course?.title ?? "Lesson")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
