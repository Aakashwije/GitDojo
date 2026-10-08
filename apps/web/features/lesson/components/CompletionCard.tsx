"use client";

import { hintsUsed } from "@gitdojo/hints";
import { type ContentRef } from "@gitdojo/progress";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { Button } from "@gitdojo/ui";
import { RotateCcw, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";
import { XpAward } from "@/features/progress";
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
  const objectives = lesson.objectives.length;
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
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 animate-gd-pop items-center justify-center rounded-md border border-success/30 bg-success-soft text-success"
        >
          <Trophy className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-small font-semibold text-success">
            {objectives > 0
              ? `All ${String(objectives)} objective${objectives === 1 ? "" : "s"} complete`
              : "Lesson complete"}
          </p>
          <p className="mt-0.5 text-small text-fg">{lesson.title}</p>
          <XpAward content={content} className="mt-1 text-small" />
          <HintSummary className="mt-0.5 text-caption text-fg-muted" />
        </div>
      </div>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onPracticeAgain}>
        <RotateCcw /> Practice again
      </Button>
    </section>
  );
}
