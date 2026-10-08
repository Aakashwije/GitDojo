"use client";

import { type CourseOutline, type LessonDefinition } from "@gitdojo/shared-types";
import { Button } from "@gitdojo/ui";
import { ArrowRight, Check, CircleCheck, Target } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import {
  courseHref,
  formatLessonNumber,
  lessonHref,
  lessonNeighbors,
  LessonPager,
  LessonTypeBadge,
} from "@/features/course";
import {
  recordCompletion,
  recordProgress,
  useCompletedLessons,
  XpAward,
} from "@/features/progress";
import { WorkspaceTopbar } from "./WorkspaceTopbar";
import { contentSections, LessonContent } from "@/features/lesson";
import { renderInline, RichText } from "@/components/content/rich-text";

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
  const blocks = lesson.content ?? [];
  // "In this lesson" is worth it once there is enough to skim; it comes from the block titles.
  const sections = contentSections(blocks);
  const outline = sections.length >= 3 ? sections : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <WorkspaceTopbar lesson={lesson} course={course} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <article>
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {position ? (
                <span className="font-mono text-caption text-fg-muted">
                  Lesson {formatLessonNumber(position.lesson.number)} of{" "}
                  {formatLessonNumber(course.lessons.length)}
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
              <p className="mt-4 flex gap-2.5 rounded-lg border border-border-subtle bg-panel p-4 text-body-lg text-fg">
                <Target className="mt-1.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  <span className="sr-only">Goal: </span>
                  {renderInline(lesson.goal)}
                </span>
              </p>
            ) : null}
            {lesson.description ? (
              <RichText text={lesson.description} className="mt-5 text-body text-fg-secondary" />
            ) : null}
          </header>

          {outline.length > 0 ? (
            <nav aria-labelledby="lesson-outline-heading" className="mt-8" data-testid="in-lesson">
              <h2
                id="lesson-outline-heading"
                className="text-micro font-semibold tracking-wider text-fg-muted uppercase"
              >
                In this lesson
              </h2>
              <ol className="mt-2 space-y-1 text-small">
                {outline.map((section, index) => (
                  <li key={section.id} className="flex gap-2">
                    <span aria-hidden="true" className="font-mono text-caption text-fg-muted">
                      {formatLessonNumber(index + 1)}
                    </span>
                    <Link
                      href={`#${section.id}`}
                      className="rounded-sm text-fg-secondary underline decoration-border-strong underline-offset-2 hover:text-fg hover:decoration-fg-muted"
                    >
                      {section.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <LessonContent blocks={blocks} className="mt-10" />
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
              <div>
                <p className="text-small font-medium text-fg">Finished reading?</p>
                <p className="mt-0.5 text-caption text-fg-muted">
                  Marking it complete records your progress and XP for this lesson.
                </p>
              </div>
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
