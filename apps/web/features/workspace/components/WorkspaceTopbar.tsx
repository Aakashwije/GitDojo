"use client";

import { type LessonDefinition } from "@gitdojo/shared-types";
import { SegmentedProgress } from "@gitdojo/ui";
import Link from "next/link";
import { LogoMark } from "@/components/site/logo";
import { useLessonStore } from "@/features/lesson/state/use-lesson-store";
import { HelpDialog } from "./HelpDialog";
import { ResetLessonButton } from "./ResetLessonDialog";

export interface WorkspaceTopbarProps {
  lesson: LessonDefinition;
  ready: boolean;
  onReset: () => Promise<void>;
}

export function WorkspaceTopbar({ lesson, ready, onReset }: WorkspaceTopbarProps) {
  const completed = useLessonStore((state) => state.progress?.completedObjectiveIds.length ?? 0);
  const commandCount = useLessonStore((state) => state.commandCount);
  const total = lesson.objectives.length;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-app px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          aria-label="GitDojo home"
          className="rounded-md p-1 text-fg transition-colors hover:bg-hover"
        >
          <LogoMark />
        </Link>
        <span aria-hidden="true" className="h-5 w-px bg-border" />
        <div className="min-w-0">
          <p className="text-caption text-fg-muted">Git Basics</p>
          <p className="truncate text-small font-semibold text-fg">{lesson.title}</p>
        </div>
      </div>

      <div className="hidden w-56 md:block">
        <p className="mb-1.5 text-caption text-fg-muted">
          <span className="font-mono text-fg-secondary">
            {completed} / {total}
          </span>{" "}
          objectives
        </p>
        <SegmentedProgress value={completed} total={total} label="Lesson progress" />
      </div>

      <div className="flex items-center gap-1">
        <span
          className="font-mono text-caption text-fg-muted md:hidden"
          aria-label="Lesson progress"
        >
          {completed}/{total}
        </span>
        <HelpDialog />
        <ResetLessonButton
          confirm={commandCount > 0 || completed > 0}
          onReset={onReset}
          disabled={!ready}
        />
      </div>
    </header>
  );
}
