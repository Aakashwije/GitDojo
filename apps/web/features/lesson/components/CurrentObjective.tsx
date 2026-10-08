"use client";

import { Button } from "@gitdojo/ui";
import { SquareTerminal, Target } from "lucide-react";
import { type ReactNode } from "react";
import { renderInline } from "@/components/content/rich-text";

export interface CurrentObjectiveProps {
  description: string;
  /** Position of this objective in the lesson, 1-based, and how many there are. */
  number: number;
  total: number;
  /** Phones show one panel at a time: jump to the terminal to actually run something. */
  onGoToTerminal?: () => void;
  /** Help for this objective (the hint panel). */
  children?: ReactNode;
}

/**
 * What to do right now, pulled out of the checklist so it is the first thing the eye lands on.
 * Everything here comes from the lesson's objectives; nothing is lesson-specific.
 */
export function CurrentObjective({
  description,
  number,
  total,
  onGoToTerminal,
  children,
}: CurrentObjectiveProps) {
  return (
    <section
      aria-labelledby="current-objective-heading"
      data-testid="current-objective"
      className="rounded-lg border border-accent-border bg-accent-soft p-3.5"
    >
      <h2
        id="current-objective-heading"
        className="flex items-center gap-2 text-micro font-semibold tracking-wider text-accent uppercase"
      >
        <Target className="size-3.5" aria-hidden="true" />
        Your task now
        <span className="font-mono tracking-normal text-fg-muted normal-case">
          Step {number} of {total}
        </span>
      </h2>
      <p className="mt-2 text-body font-medium text-fg">{renderInline(description)}</p>
      {onGoToTerminal ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 md:hidden"
          data-testid="go-to-terminal"
          onClick={onGoToTerminal}
        >
          <SquareTerminal /> Open the terminal
        </Button>
      ) : null}
      {children}
    </section>
  );
}
