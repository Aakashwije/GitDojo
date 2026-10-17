"use client";

import {
  learningJourney,
  type JourneyMilestone,
  type LocalProgress,
  type MilestoneStatus,
  type ProgressCatalog,
} from "@gitdojo/progress";
import { Button, cn } from "@gitdojo/ui";
import {
  ArrowRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Map as MapIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { courseHref, CourseProgressBar, lessonHref } from "@/features/course";
import { formatRelativeTime } from "@/lib/time";

const MILESTONES: Record<MilestoneStatus, { label: string; icon: LucideIcon; node: string }> = {
  completed: {
    label: "Completed",
    icon: CircleCheck,
    node: "border-success/40 bg-success-soft text-success",
  },
  current: {
    label: "Current",
    icon: CircleDot,
    node: "border-accent bg-accent-soft text-accent ring-4 ring-accent-soft",
  },
  available: {
    label: "Available",
    icon: CircleDashed,
    node: "border-border-strong bg-elevated text-fg-secondary",
  },
  upcoming: {
    label: "Upcoming",
    icon: Circle,
    node: "border-border bg-panel text-fg-faint",
  },
};

/**
 * "Your Git journey": every course as a milestone on one path, in catalog order, with the next
 * lesson as the dashboard's primary action. Derived from course progress and continue learning.
 */
export function LearningJourney({
  progress,
  catalog,
  fresh,
}: {
  progress: LocalProgress;
  catalog: ProgressCatalog;
  /** Nothing done yet: welcome the learner instead of "continue". */
  fresh: boolean;
}) {
  const journey = learningJourney(progress, catalog.courses);
  const { target } = journey;
  const last = progress.lastLesson;

  return (
    <section
      aria-labelledby="journey-heading"
      data-testid="journey"
      className="rounded-xl border border-accent-border bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 flex-1 basis-80">
          <h2
            id="journey-heading"
            className="flex items-center gap-2 text-micro font-semibold tracking-wider text-fg-muted uppercase"
          >
            <MapIcon className="size-4" aria-hidden="true" />
            Your Git journey
          </h2>
          {fresh ? (
            <p data-testid="dashboard-empty" className="mt-3 max-w-xl text-body text-fg-secondary">
              <strong className="font-semibold text-fg">Welcome to GitDojo.</strong> Nothing here
              yet: start with the first lesson, and your lessons, challenges and Practice tasks show
              up here as you finish them.
            </p>
          ) : null}
          {target ? (
            <>
              <p className="mt-3 text-small text-fg-muted">
                {target.reason === "resume"
                  ? "Continue learning"
                  : target.reason === "start"
                    ? "Start here"
                    : "Up next"}
              </p>
              <p className="mt-1 text-h3 font-semibold text-fg" data-testid="continue-title">
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
              <p className="mt-3 text-h3 font-semibold text-fg" data-testid="continue-title">
                Every course complete
              </p>
              <p className="mt-1 text-small text-fg-secondary">
                Put it all together with real-world challenges, or keep your skills sharp in
                Practice.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {fresh ? (
            <Button asChild variant="secondary" size="lg">
              <Link href="/playground">Open the playground</Link>
            </Button>
          ) : null}
          <Button asChild variant="primary" size="lg">
            {target ? (
              <Link
                href={lessonHref(target.course.slug, target.lesson.slug)}
                data-testid="continue-learning"
              >
                {target.reason === "resume"
                  ? "Continue"
                  : target.reason === "start"
                    ? `Start ${target.course.title}`
                    : "Next lesson"}{" "}
                <ArrowRight />
              </Link>
            ) : (
              <Link href="/challenges" data-testid="continue-learning">
                Browse challenges <ArrowRight />
              </Link>
            )}
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <p className="flex items-baseline justify-between gap-3 text-small text-fg-secondary">
          <span data-testid="journey-summary">
            <span className="font-mono font-semibold text-fg">{journey.completed}</span> of{" "}
            <span className="font-mono">{journey.total}</span> course lessons completed
          </span>
          <span className="font-mono text-fg-muted">{journey.percent}%</span>
        </p>
        <div
          role="progressbar"
          aria-label="Course lessons completed"
          aria-valuetext={`${String(journey.completed)} of ${String(journey.total)} lessons`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={journey.percent}
          className="mt-2 h-2 overflow-hidden rounded-full bg-border-strong"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${String(journey.percent)}%` }}
          />
        </div>
      </div>

      <ol
        aria-label="Courses in order"
        data-testid="journey-path"
        className="mt-6 grid gap-0 lg:auto-cols-fr lg:grid-flow-col lg:gap-3"
      >
        {journey.milestones.map((milestone, index) => (
          <Milestone
            key={milestone.course.id}
            milestone={milestone}
            last={index === journey.milestones.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

function Milestone({ milestone, last }: { milestone: JourneyMilestone; last: boolean }) {
  const { course, progress, status } = milestone;
  const { label, icon: Icon, node } = MILESTONES[status];
  return (
    <li
      data-course={course.id}
      data-status={status}
      data-testid="journey-milestone"
      className="group relative flex gap-3 pb-5 last:pb-0 lg:flex-col lg:pb-0"
    >
      {last ? null : (
        // The path to the next course: filled once this one is complete. Below lg it runs down
        // from this node to the next; from lg it runs across.
        <span
          aria-hidden="true"
          className="absolute top-9 bottom-0 left-[17px] w-0.5 overflow-hidden rounded-full bg-border-strong lg:top-[17px] lg:right-[-12px] lg:bottom-auto lg:left-11 lg:h-0.5 lg:w-auto"
        >
          <span
            className={cn(
              "block size-full origin-top bg-success transition-transform duration-500 ease-out lg:origin-left",
              status === "completed" ? "scale-100" : "max-lg:scale-y-0 lg:scale-x-0",
            )}
          />
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-[transform,color,background-color,border-color] duration-200 ease-out motion-safe:group-focus-within:scale-110 motion-safe:group-hover:scale-110",
          node,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 lg:pr-2">
        <Link
          href={courseHref(course.slug)}
          aria-current={status === "current" ? "step" : undefined}
          className="text-small font-semibold text-fg hover:underline"
        >
          {course.title}
        </Link>
        <p
          className={cn(
            "text-caption",
            status === "completed"
              ? "text-success"
              : status === "current"
                ? "text-accent"
                : "text-fg-muted",
          )}
          data-testid="milestone-status"
        >
          {label}
        </p>
        <CourseProgressBar
          progress={progress}
          label={`${course.title} progress`}
          className="mt-2 max-w-sm"
        />
      </div>
    </li>
  );
}
