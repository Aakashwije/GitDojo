"use client";

import { type CourseOutline, type LessonDefinition } from "@gitdojo/shared-types";
import { Button } from "@gitdojo/ui";
import { ArrowRight, Check, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { LessonPager } from "@/features/course/components/LessonPager";
import { LessonTypeBadge } from "@/features/course/components/LessonTypeBadge";
import {
  courseHref,
  formatLessonNumber,
  lessonHref,
  lessonNeighbors,
} from "@/features/course/services/course-navigation";
import { XpAward } from "@/features/progress/components/XpAward";
import {
  recordCompletion,
  recordProgress,
  useCompletedLessons,
} from "@/features/progress/state/use-progress-store";
import { WorkspaceTopbar } from "@/features/workspace/components/WorkspaceTopbar";
import { LessonContent } from "./content/LessonContent";
import { renderInline, RichText } from "./RichText";

/**
 * A concept lesson: explanations, diagrams and step-through demos in a reading layout, with no
 * terminal. The learner marks it complete when they are done.
 */
export function ConceptLesson({
  lesson,
  course,
}: {
  lesson: LessonDefinition;
  course: CourseOutline;
}) {
  const position = lessonNeighbors(course, lesson.slug);
  const { completed, hydrated } = useCompletedLessons();
  const done = completed.has(lesson.id);
  const courseId = course.id;

  useEffect(() => {
    void recordProgress({ type: "visit-lesson", courseId, lessonId: lesson.id });
  }, [courseId, lesson.id]);
  const next = position?.next ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      <WorkspaceTopbar lesson={lesson} course={course} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <article>
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {position ? (
                <span className="font-mono text-caption text-fg-muted">
                  Lesson {formatLessonNumber(position.lesson.number)}
                </span>
              ) : null}
              <LessonTypeBadge type="concept" />
              {done ? (
                <span className="flex items-center gap-1 text-caption text-success">
                  <CircleCheck className="size-3.5" aria-hidden="true" /> Completed
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-h2 font-semibold tracking-tight text-fg sm:text-h1">
              {lesson.title}
            </h1>
            {lesson.goal ? (
              <p className="mt-3 text-body-lg text-fg-secondary">{renderInline(lesson.goal)}</p>
            ) : null}
            {lesson.description ? (
              <RichText text={lesson.description} className="mt-4 text-body text-fg-secondary" />
            ) : null}
          </header>

          <LessonContent blocks={lesson.content ?? []} className="mt-10" />
        </article>

        <section
          aria-label="Lesson completion"
          data-testid="concept-completion"
          className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-panel p-5"
        >
          {done ? (
            <>
              <div role="status">
                <p className="flex items-center gap-2 text-small font-medium text-success">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Lesson complete
                </p>
                <XpAward content={{ kind: "lesson", id: lesson.id }} className="mt-1 text-small" />
              </div>
              <Button asChild variant="primary">
                <Link
                  href={next ? lessonHref(course.slug, next.slug) : courseHref(course.slug)}
                  data-testid="concept-continue"
                >
                  {next ? `Next: ${next.title}` : "Back to course"} <ArrowRight />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-small text-fg-secondary">Finished reading?</p>
              <Button
                variant="primary"
                disabled={!hydrated}
                data-testid="mark-complete"
                onClick={() => {
                  // Concept lessons have no objectives: reading them is the completion.
                  void recordCompletion({
                    kind: "lesson",
                    id: lesson.id,
                    type: "concept",
                    courseId: course.id,
                  });
                }}
              >
                <Check /> Mark as complete
              </Button>
            </>
          )}
        </section>

        {position ? (
          <LessonPager courseSlug={course.slug} position={position} className="mt-6" />
        ) : null}
      </main>
    </div>
  );
}
