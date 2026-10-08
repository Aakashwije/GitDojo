"use client";

import { type CourseOutline, type LessonDefinition } from "@gitdojo/shared-types";
import { SegmentedProgress } from "@gitdojo/ui";
import Link from "next/link";
import { LogoMark } from "@/components/site/logo";
import { AccountControls } from "@/features/auth";
import { CourseNavigationDialog, lessonNeighbors } from "@/features/course";
import type { ChallengeContext } from "@/features/challenges";
import { useLessonStore } from "@/features/lesson";
import { HelpDialog } from "./HelpDialog";
import { ResetLessonButton } from "./ResetLessonDialog";

export interface WorkspaceTopbarProps {
  lesson: LessonDefinition;
  /** The course this lesson belongs to; standalone lessons (the demo) have none. */
  course?: CourseOutline;
  /** Set for challenges from /challenges. */
  challenge?: ChallengeContext;
  /** Hands-on lessons only: terminal controls. */
  terminal?: {
    ready: boolean;
    onReset: () => Promise<void>;
  };
}

export function WorkspaceTopbar({ lesson, course, challenge, terminal }: WorkspaceTopbarProps) {
  const completed = useLessonStore((state) =>
    state.progress?.lessonId === lesson.id ? state.progress.completedObjectiveIds.length : 0,
  );
  const commandCount = useLessonStore((state) => state.commandCount);
  const total = lesson.objectives.length;
  const position = course ? lessonNeighbors(course, lesson.slug) : null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-app px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link
          href={challenge ? "/challenges" : course ? "/learn" : "/"}
          aria-label={challenge ? "All challenges" : course ? "All courses" : "GitDojo home"}
          className="shrink-0 rounded-md p-1 text-fg transition-colors hover:bg-hover"
        >
          <LogoMark />
        </Link>
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
        {challenge ? (
          <div className="min-w-0" data-testid="challenge-context">
            <p className="text-caption text-fg-muted">
              <Link href="/challenges" className="hover:text-fg">
                Challenges
              </Link>{" "}
              · {challenge.categoryTitle}
            </p>
            <p className="truncate text-small font-semibold text-fg">{lesson.title}</p>
          </div>
        ) : course && position ? (
          <CourseNavigationDialog course={course} position={position} />
        ) : (
          <div className="min-w-0">
            <p className="text-caption text-fg-muted">Demo lesson</p>
            <p className="truncate text-small font-semibold text-fg">{lesson.title}</p>
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="hidden w-56 shrink-0 md:block">
          <p className="mb-1.5 text-caption text-fg-muted">
            <span className="font-mono text-fg-secondary">
              {completed} / {total}
            </span>{" "}
            objectives
          </p>
          <SegmentedProgress value={completed} total={total} label="Lesson progress" />
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1">
        {terminal ? (
          <>
            <span
              className="font-mono text-caption text-fg-muted md:hidden"
              aria-label="Lesson progress"
            >
              {completed}/{total}
            </span>
            <HelpDialog />
            <ResetLessonButton
              confirm={commandCount > 0 || completed > 0}
              onReset={terminal.onReset}
              disabled={!terminal.ready}
            />
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
          </>
        ) : null}
        <AccountControls compact />
      </div>
    </header>
  );
}
