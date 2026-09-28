import { type LessonObjective } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { Circle, CircleCheck, CircleDot } from "lucide-react";
import { renderInline } from "./RichText";

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

export function ObjectiveList({ objectives, completedIds, currentId }: ObjectiveListProps) {
  const completed = new Set(completedIds);

  return (
    <section aria-labelledby="objectives-heading">
      <div className="flex items-center justify-between">
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
      <ol className="mt-2 space-y-1">
        {objectives.map((objective) => {
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
                "flex items-start gap-2.5 rounded-md border px-3 py-2 text-small transition-colors duration-200",
                state === "current"
                  ? "border-accent-border bg-accent-soft text-fg"
                  : "border-transparent",
                state === "completed" && "text-fg-muted",
                state === "upcoming" && "text-fg-faint",
              )}
            >
              {state === "completed" ? (
                <CircleCheck
                  key="done"
                  className="mt-0.5 size-4 shrink-0 animate-gd-check text-success"
                  aria-hidden="true"
                />
              ) : state === "current" ? (
                <CircleDot className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {renderInline(objective.description)}
                <span className="sr-only"> ({STATE_LABEL[state]})</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
