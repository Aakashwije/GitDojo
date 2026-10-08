"use client";

import { type LessonObjective } from "@gitdojo/shared-types";
import { cn, SegmentedProgress } from "@gitdojo/ui";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderInline } from "@/components/content/rich-text";

export type ObjectiveState = "completed" | "current" | "upcoming";

export interface ObjectiveListProps {
  objectives: LessonObjective[];
  completedIds: readonly string[];
  currentId: string | null;
}

const STATE_LABEL: Record<ObjectiveState, string> = {
  completed: "Completed",
  current: "Current objective",
  upcoming: "Not started",
};

/**
 * The lesson's checklist: what is done, what is next. Progress is sticky, so the announcement
 * below only ever reports newly completed objectives.
 */
export function ObjectiveList({ objectives, completedIds, currentId }: ObjectiveListProps) {
  const completed = new Set(completedIds);
  const announcement = useCompletionAnnouncement(objectives, completedIds);

  return (
    <section aria-labelledby="objectives-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="objectives-heading"
          className="text-micro font-semibold tracking-wider text-fg-muted uppercase"
        >
          Objectives
        </h2>
        <span className="font-mono text-caption text-fg-muted">
          {completed.size}/{objectives.length}
        </span>
      </div>
      <SegmentedProgress
        value={completed.size}
        total={objectives.length}
        label="Objectives completed"
        className="mt-2"
      />
      <ol className="mt-3 space-y-1">
        {objectives.map((objective, index) => {
          const state: ObjectiveState = completed.has(objective.id)
            ? "completed"
            : objective.id === currentId
              ? "current"
              : "upcoming";
          return (
            <li
              key={objective.id}
              data-testid={`objective-${objective.id}`}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-small transition-colors duration-200",
                state === "current" && "border-accent-border bg-accent-soft text-fg",
                state === "completed" && "border-transparent text-fg-muted",
                state === "upcoming" && "border-transparent text-fg-muted",
              )}
            >
              <ObjectiveMarker state={state} number={index + 1} />
              <span className={cn("min-w-0 flex-1", state === "current" && "font-medium")}>
                {renderInline(objective.description)}
                <span className="sr-only"> ({STATE_LABEL[state]})</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/**
 * A numbered step, so the order is obvious: a check once passed, a filled accent disc while
 * current, and a quiet outline before that. The number is the position in the lesson.
 */
function ObjectiveMarker({ state, number }: { state: ObjectiveState; number: number }) {
  if (state === "completed") {
    return (
      <span
        aria-hidden="true"
        className="mt-px flex size-5 shrink-0 animate-gd-check items-center justify-center rounded-full border border-success/40 bg-success-soft text-success"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-px flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-micro",
        state === "current"
          ? "border-accent bg-accent-soft font-semibold text-accent"
          : "border-border-strong text-fg-muted",
      )}
    >
      {number}
    </span>
  );
}

/** "Objective complete: ..." for screen readers, whenever an objective newly passes. */
function useCompletionAnnouncement(
  objectives: readonly LessonObjective[],
  completedIds: readonly string[],
): string {
  const [announcement, setAnnouncement] = useState("");
  const known = useRef<ReadonlySet<string>>(new Set(completedIds));

  useEffect(() => {
    const now = new Set(completedIds);
    const fresh = completedIds.filter((id) => !known.current.has(id));
    known.current = now;
    const last = fresh.at(-1);
    if (last === undefined) return;
    const objective = objectives.find((candidate) => candidate.id === last);
    if (!objective) return;
    setAnnouncement(
      `Objective complete: ${objective.description} ${String(now.size)} of ${String(objectives.length)} done.`,
    );
  }, [completedIds, objectives]);

  return announcement;
}
