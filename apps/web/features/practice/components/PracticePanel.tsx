"use client";

import { type LessonValidationResult, type PracticeTaskSummary } from "@gitdojo/shared-types";
import { Badge, Button, cn, Panel } from "@gitdojo/ui";
import { BookOpen, CircleCheck, RotateCcw, SearchCheck, Shuffle, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RichText, renderInline } from "@/components/content/rich-text";
import { skillLabel } from "../services/practice-navigation";

export interface PracticePanelProps {
  task: PracticeTaskSummary;
  scenario: string;
  /** `null` while the workspace is loading. */
  validation: LessonValidationResult | null;
  solved: boolean;
  related: { href: string; title: string } | null;
  /** Where "Another task" goes, or `null` when there is no other task. */
  another: { href: string; title: string } | null;
  onRetry: () => void;
  className?: string;
}

/**
 * The task side of a practice workspace: the scenario and the mission, nothing more. There are
 * no objectives or hints; "Check my work" says whether the end state is reached and, if not,
 * one thing about the repository that is not there yet.
 */
export function PracticePanel({
  task,
  scenario,
  validation,
  solved,
  related,
  another,
  onRetry,
  className,
}: PracticePanelProps) {
  // The feedback belongs to the state it was asked about; any new step hides it again.
  const [checkedAt, setCheckedAt] = useState<LessonValidationResult | null>(null);
  const feedback =
    checkedAt !== null && checkedAt === validation && !solved
      ? (validation.objectives.find((objective) => !objective.passed)?.reason ?? null)
      : null;

  return (
    <Panel
      data-testid="practice-panel"
      className={cn("flex min-h-0 flex-col overflow-auto p-5", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="branch">{skillLabel(task.skill)}</Badge>
        <Badge tone="neutral">{task.difficulty}</Badge>
        <Badge tone="accent">Practice</Badge>
      </div>
      <h1 className="mt-3 text-h3 font-semibold text-fg">{task.title}</h1>
      <RichText text={scenario} className="mt-3 text-small text-fg-secondary" />

      <section
        aria-labelledby="practice-mission"
        className="mt-4 rounded-lg border border-accent-border bg-accent-soft p-4"
      >
        <h2
          id="practice-mission"
          className="flex items-center gap-2 text-caption font-semibold tracking-wide text-accent uppercase"
        >
          <Target className="size-4" aria-hidden="true" /> Your mission
        </h2>
        <p className="mt-1.5 text-small text-fg">{renderInline(task.mission)}</p>
      </section>

      <p className="mt-3 text-caption text-fg-muted">
        No steps and no hints here: GitDojo checks the repository after every command and edit,
        whichever way you get there.
      </p>

      <div role="status" aria-live="polite" data-testid="practice-status" className="mt-5">
        {validation === null ? (
          <p className="text-small text-fg-muted">Setting up the repository…</p>
        ) : solved ? (
          <div className="rounded-lg border border-success/30 bg-success-soft p-4">
            <p className="flex items-center gap-2 text-small font-semibold text-success">
              <CircleCheck className="size-4" aria-hidden="true" /> Solved
            </p>
            <p className="mt-1 text-small text-fg-secondary">
              The repository is in the end state the mission describes. Practice tasks are recorded
              on your dashboard and never change XP.
            </p>
          </div>
        ) : feedback !== null ? (
          <p className="text-small text-fg-secondary" data-testid="practice-feedback">
            <span className="font-semibold text-fg">Not yet.</span> {feedback}
          </p>
        ) : (
          <p className="text-small text-fg-muted">Not solved yet.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {solved ? null : (
          <Button
            size="sm"
            variant="secondary"
            disabled={validation === null}
            data-testid="practice-check"
            onClick={() => {
              setCheckedAt(validation);
            }}
          >
            <SearchCheck /> Check my work
          </Button>
        )}
        <Button
          size="sm"
          variant={solved ? "secondary" : "ghost"}
          onClick={onRetry}
          disabled={validation === null}
        >
          <RotateCcw /> {solved ? "Try again" : "Start over"}
        </Button>
        {another ? (
          <Button asChild size="sm" variant={solved ? "primary" : "ghost"}>
            <Link href={another.href} data-testid="practice-another">
              <Shuffle /> Another task
            </Link>
          </Button>
        ) : null}
      </div>
      {related ? (
        <p className="mt-5 border-t border-border-subtle pt-4 text-small text-fg-secondary">
          <BookOpen
            className="mr-1.5 inline size-4 align-[-3px] text-fg-muted"
            aria-hidden="true"
          />
          Want the guided version?{" "}
          <Link href={related.href} className="text-accent underline-offset-2 hover:underline">
            {related.title}
          </Link>
        </p>
      ) : null}
    </Panel>
  );
}
