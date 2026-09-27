"use client";

import { type LessonDefinition } from "@gitdojo/shared-types";
import { Button } from "@gitdojo/ui";
import { RotateCcw, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";

export function CompletionCard({
  lesson,
  onPracticeAgain,
}: {
  lesson: LessonDefinition;
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
      {lesson.completion?.xp ? (
        <p className="mt-1 font-mono text-small font-semibold text-success">
          +{lesson.completion.xp} XP
        </p>
      ) : null}
      <Button size="sm" variant="secondary" className="mt-3" onClick={onPracticeAgain}>
        <RotateCcw /> Practice again
      </Button>
    </section>
  );
}
