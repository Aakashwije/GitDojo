"use client";

import { type CourseOutline } from "@gitdojo/shared-types";
import { Button, cn } from "@gitdojo/ui";
import { ArrowRight, Trophy } from "lucide-react";
import Link from "next/link";
import {
  courseProgress,
  formatLessonNumber,
  lessonHref,
  nextLessonToStudy,
} from "../services/course-navigation";
import { useCompletedLessons } from "@/features/progress/state/use-progress-store";
import { CourseOutlineList } from "./CourseOutlineList";
import { CourseProgressBar } from "./CourseProgressBar";

/** Progress, "continue" and the full lesson list on a course page. */
export function CourseOverview({
  course,
  className,
}: {
  course: CourseOutline;
  className?: string;
}) {
  const { completed } = useCompletedLessons();
  const progress = courseProgress(course, completed);
  const next = nextLessonToStudy(course, completed);
  const first = course.lessons[0];

  return (
    <div className={cn("space-y-6", className)}>
      <section className="rounded-xl border border-border bg-panel p-5">
        <CourseProgressBar progress={progress} />
        {next ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-small text-fg-secondary">
              {progress.completedCount === 0 ? "Start with" : "Up next"}:{" "}
              <span className="font-mono text-fg-muted">{formatLessonNumber(next.number)}</span>{" "}
              <span className="font-medium text-fg">{next.title}</span>
            </p>
            <Button asChild variant="primary">
              <Link href={lessonHref(course.slug, next.slug)} data-testid="continue-course">
                {progress.completedCount === 0 ? "Start course" : "Continue"} <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-small font-medium text-success">
              <Trophy className="size-4" aria-hidden="true" />
              Course complete
            </p>
            {first ? (
              <Button asChild variant="secondary">
                <Link href={lessonHref(course.slug, first.slug)}>Review from the start</Link>
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="lessons-heading">
        <h2
          id="lessons-heading"
          className="mb-2 text-micro font-semibold tracking-wider text-fg-muted uppercase"
        >
          Lessons
        </h2>
        <CourseOutlineList
          course={course}
          completed={completed}
          currentLessonId={next?.id ?? null}
        />
      </section>
    </div>
  );
}
