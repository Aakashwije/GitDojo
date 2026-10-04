"use client";

import { hintsUsed } from "@gitdojo/hints";
import { type ContentRef } from "@gitdojo/progress";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { Button } from "@gitdojo/ui";
import { RotateCcw, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";
import { XpAward } from "@/features/progress/components/XpAward";
import { useLessonStore } from "../state/use-lesson-store";

/** "Solved without hints" / "3 hints used", for the completion card and dialog. */
export function HintSummary({ className }: { className?: string }) {
  const used = useLessonStore((state) => hintsUsed(state.hintStates));
  return (
    <p className={className} data-testid="hints-used">
      {used === 0 ? "Solved without hints" : `${String(used)} hint${used === 1 ? "" : "s"} used`}
    </p>
  );
}

export function CompletionCard({
  lesson,
  content,
  onPracticeAgain,
}: {
  lesson: LessonDefinition;
  content: Pick<ContentRef, "kind" | "id">;
  onPracticeAgain: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // The lesson panel scrolls; make sure the learner actually sees the result.
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  return (
    <section
      ref={ref}
      data-testid="lesson-complete"
      aria-live="polite"
      className="animate-gd-enter rounded-lg border border-success/30 bg-success-soft p-4"
    >
      <p className="flex items-center gap-2 text-small font-semibold text-success">
        <Trophy className="size-4" aria-hidden="true" />
        Lesson Complete
      </p>
      <p className="mt-1 text-small text-fg">{lesson.title}</p>
      <XpAward content={content} className="mt-1 text-small" />
      <HintSummary className="mt-1 text-caption text-fg-muted" />
      <Button size="sm" variant="secondary" className="mt-3" onClick={onPracticeAgain}>
        <RotateCcw /> Practice again
      </Button>
    </section>
  );
}
