"use client";

import { type LessonTip } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { Compass } from "lucide-react";
import { RichText } from "@/components/content/rich-text";

export interface LessonTipNoteProps {
  tips: readonly LessonTip[];
  /** Ids of the tips whose conditions hold right now. */
  matching: readonly string[];
  className?: string;
}

/**
 * The most specific thing worth checking about the current state. Authors order tips by
 * specificity and only the first match is shown, so a learner who has gone two ways wrong reads
 * one note rather than a list. Nothing is sticky: the note is gone once its condition stops
 * holding.
 */
export function firstMatchingTip(
  tips: readonly LessonTip[],
  matching: readonly string[],
): LessonTip | null {
  const matched = new Set(matching);
  return tips.find((tip) => matched.has(tip.id)) ?? null;
}

export function LessonTipNote({ tips, matching, className }: LessonTipNoteProps) {
  const tip = firstMatchingTip(tips, matching);
  if (!tip) return null;

  return (
    <div
      // A status region: the note appears in response to what the learner just did.
      role="status"
      aria-live="polite"
      data-testid="lesson-tip"
      data-tip={tip.id}
      className={cn(
        "flex animate-gd-enter gap-3 rounded-md border border-info/25 bg-info/10 p-3",
        className,
      )}
    >
      <Compass className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
      <div className="min-w-0">
        {/* Named in text, so the note never depends on its colour to be understood. */}
        <p className="text-micro font-semibold tracking-wider text-info uppercase">
          Worth checking
        </p>
        <RichText text={tip.text} className="mt-1 text-small text-fg-secondary" />
      </div>
    </div>
  );
}
