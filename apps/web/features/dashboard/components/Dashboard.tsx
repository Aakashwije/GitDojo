"use client";

import {
  commandSummary,
  completedChallengeIds,
  completedLessonIds,
  continueLearning,
  courseProgress,
  MASTERY_RULE,
  recentActivity,
  recommendNextSteps,
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
import { Badge, Button, cn } from "@gitdojo/ui";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Compass,
  Flag,
  GraduationCap,
  History,
  Medal,
  SquareTerminal,
  Star,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { courseHref, CourseProgressBar, lessonHref } from "@/features/course";
import { challengeHref } from "@/features/challenges";
import { formatRelativeTime, formatTimestamp } from "@/lib/time";
import { ProgressManagement, useProgressStore } from "@/features/progress";

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
  // The continue card already shows where to carry on; the list adds what comes after it.
  const continueHref = target ? lessonHref(target.course.slug, target.lesson.slug) : null;
  const nextSteps = recommendNextSteps(progress, catalog, { limit: 4 })
    .filter((step) => step.href !== continueHref)
    .slice(0, 3);

  return (
    <div data-testid="dashboard" className="mt-10 space-y-10">
      {fresh ? (
        <section
          aria-labelledby="welcome-heading"
          data-testid="dashboard-empty"
          className="rounded-xl border border-border bg-panel p-6 sm:p-8"
        >
          <GraduationCap className="size-8 text-accent" aria-hidden="true" />
          <h2 id="welcome-heading" className="mt-4 text-h3 font-semibold text-fg">
            Welcome to GitDojo
          </h2>
          <p className="mt-2 max-w-xl text-body text-fg-secondary">
            Nothing here yet. Complete lessons and challenges to earn XP, and your progress shows up
            here.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {target ? (
              <Button asChild variant="primary">
                <Link
                  href={lessonHref(target.course.slug, target.lesson.slug)}
                  data-testid="continue-learning"
                >
                  Start {target.course.title} <ArrowRight />
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href="/playground">Open the playground</Link>
            </Button>
          </div>
        </section>
      ) : (
        <ContinueCard progress={progress} catalog={catalog} />
      )}

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

      <SkillsSection skills={skills} />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="courses-heading">
          <SectionHeading id="courses-heading" icon={GraduationCap}>
            Course progress
          </SectionHeading>
          <ul className="mt-4 space-y-3" data-testid="course-progress">
            {catalog.courses.map((course) => {
              const value = courseProgress(course, lessons);
              return (
                <li
                  key={course.id}
                  data-course={course.id}
                  className="rounded-lg border border-border-subtle bg-panel p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={courseHref(course.slug)}
                      className="text-small font-medium text-fg hover:underline"
                    >
                      {course.title}
                    </Link>
                    {value.total > 0 && value.completedCount === value.total ? (
                      <span className="flex items-center gap-1 text-caption text-success">
                        <Trophy className="size-3.5" aria-hidden="true" /> Complete
                      </span>
                    ) : null}
                  </div>
                  <CourseProgressBar
                    progress={value}
                    label={`${course.title} progress`}
                    className="mt-3"
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-6">
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

          <section aria-labelledby="commands-heading">
            <SectionHeading id="commands-heading" icon={SquareTerminal}>
              Most used commands
            </SectionHeading>
            {commands.commands.length === 0 ? (
              <p className="mt-4 text-small text-fg-muted">
                Git commands you run in lessons, challenges and the playground are counted here.
              </p>
            ) : (
              <table className="mt-4 w-full text-small" data-testid="command-usage">
                <thead>
                  <tr className="text-left text-caption text-fg-muted">
                    <th scope="col" className="pb-2 font-medium">
                      Command
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Uses
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Succeeded
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {commands.commands.slice(0, 6).map((command) => (
                    <tr key={command.command} className="border-t border-border-subtle">
                      <th scope="row" className="py-1.5 text-left font-mono font-normal text-fg">
                        git {command.command}
                      </th>
                      <td className="py-1.5 text-right font-mono text-fg-secondary">
                        {command.uses}
                      </td>
                      <td className="py-1.5 text-right font-mono text-fg-secondary">
                        {command.successes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>

      <ProgressManagement />
    </div>
  );
}

function ContinueCard({
  progress,
  catalog,
}: {
  progress: LocalProgress;
  catalog: ProgressCatalog;
}) {
  const target = continueLearning(progress, catalog.courses);
  const last = progress.lastLesson;

  return (
    <section
      aria-labelledby="continue-heading"
      className="flex flex-wrap items-center justify-between gap-6 rounded-xl border border-accent-border bg-panel p-6"
    >
      <div className="min-w-0">
        <h2
          id="continue-heading"
          className="text-micro font-semibold tracking-wider text-fg-muted uppercase"
        >
          Continue learning
        </h2>
        {target ? (
          <>
            <p className="mt-2 text-h3 font-semibold text-fg" data-testid="continue-title">
              {target.lesson.title}
            </p>
            <p className="mt-1 text-small text-fg-secondary">
              {target.course.title} · Lesson {target.lesson.number} of{" "}
              {target.course.lessons.length}
              {target.reason === "resume" && last ? (
                <>
                  {" "}
                  · visited{" "}
                  <time dateTime={new Date(last.visitedAt).toISOString()}>
                    {formatRelativeTime(last.visitedAt / 1000)}
                  </time>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-h3 font-semibold text-fg">Every course complete</p>
            <p className="mt-1 text-small text-fg-secondary">
              Put it all together with real-world challenges.
            </p>
          </>
        )}
      </div>
      <Button asChild variant="primary" size="lg">
        {target ? (
          <Link
            href={lessonHref(target.course.slug, target.lesson.slug)}
            data-testid="continue-learning"
          >
            {target.reason === "resume" ? "Continue" : "Next lesson"} <ArrowRight />
          </Link>
        ) : (
          <Link href="/challenges" data-testid="continue-learning">
            Browse challenges <ArrowRight />
          </Link>
        )}
      </Button>
    </section>
  );
}

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

function SectionHeading({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-body font-semibold text-fg">
      <Icon className="size-4 text-fg-muted" aria-hidden="true" />
      {children}
    </h2>
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
                className="flex h-full flex-col rounded-lg border border-border-subtle bg-panel p-4 transition-colors hover:border-border-strong"
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

const STATUS_LABELS: Record<SkillStatus, string> = {
  untouched: "Not started",
  studied: "Read about",
  practiced: "Practiced",
  mastered: "Mastered",
};

const STATUS_TONES: Record<SkillStatus, "neutral" | "accent" | "success"> = {
  untouched: "neutral",
  studied: "neutral",
  practiced: "accent",
  mastered: "success",
};

function SkillsSection({ skills }: { skills: SkillProgress[] }) {
  const practiced = skills.filter(
    (entry) => entry.status === "practiced" || entry.status === "mastered",
  );
  return (
    <section aria-labelledby="skills-heading" data-testid="skills">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="skills-heading" icon={Medal}>
          Skills practiced
        </SectionHeading>
        <p className="text-small text-fg-muted" data-testid="skills-summary">
          <span className="font-mono text-fg-secondary">
            {practiced.length} / {skills.length}
          </span>{" "}
          practiced
        </p>
      </div>
      <p className="mt-2 max-w-3xl text-caption text-fg-muted" data-testid="skills-explanation">
        A skill counts as <strong className="font-semibold">practiced</strong> once you finish a
        hands-on lesson, challenge or practice task tagged with it; reading a concept lesson only
        counts as read. <strong className="font-semibold">Mastered</strong> takes{" "}
        {MASTERY_RULE.handsOn} hands-on completions, at least {MASTERY_RULE.unguided} of them a
        challenge or practice task done without step-by-step help. Counted from your completions
        only, the same with or without an account.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {skills.map((entry) => (
          <li
            key={entry.skill.id}
            data-testid="skill"
            data-skill={entry.skill.id}
            data-status={entry.status}
            className="rounded-lg border border-border-subtle bg-panel px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="truncate text-small font-medium text-fg"
                title={entry.skill.description}
              >
                {entry.skill.label}
              </span>
              <Badge tone={STATUS_TONES[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>
            </div>
            <p className="mt-1 text-caption text-fg-muted">
              {entry.handsOn} of {entry.available} hands-on done
              {entry.unguided > 0 ? ` · ${String(entry.unguided)} unguided` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
