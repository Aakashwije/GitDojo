"use client";

import { type DemoStep } from "@gitdojo/shared-types";
import { Button, cn, SegmentedProgress } from "@gitdojo/ui";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { renderInline } from "@/components/content/rich-text";
import { LessonVisualView } from "./LessonVisualView";
import { CommandLine } from "./ContentBlocks";

/** A mini visual demonstration the learner steps through at their own pace. */
export function DemoPlayer({ title, steps }: { title?: string; steps: DemoStep[] }) {
  const [index, setIndex] = useState(0);
  const dots = useRef<(HTMLButtonElement | null)[]>([]);
  const headingId = useId();
  const step = steps[index];
  if (!step) return null;
  const last = index === steps.length - 1;

  /** Move to a step and keep focus on its dot, so arrow keys can keep walking the demo. */
  const goTo = (next: number, focus: boolean) => {
    const clamped = Math.min(Math.max(next, 0), steps.length - 1);
    setIndex(clamped);
    if (focus) dots.current[clamped]?.focus();
  };

  const onDotKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: steps.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    goTo(next, true);
  };

  return (
    <section
      aria-roledescription="demonstration"
      aria-labelledby={headingId}
      data-testid="demo-player"
      className="overflow-hidden rounded-lg border border-border bg-panel"
    >
      <header className="border-b border-border-subtle px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p id={headingId} className="text-small font-semibold text-fg">
            {title ?? "Try it step by step"}
          </p>
          <p className="shrink-0 font-mono text-caption text-fg-muted" data-testid="demo-step">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <SegmentedProgress
          value={index + 1}
          total={steps.length}
          label="Demonstration progress"
          className="mt-2"
        />
      </header>

      <div className="space-y-3 p-4">
        {step.command ? <CommandLine command={step.command} /> : null}
        <LessonVisualView visual={step} />
        <p className="text-small text-fg-secondary">{renderInline(step.caption)}</p>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border-subtle px-3 py-2">
        <ol
          className="flex items-center"
          aria-label="Steps"
          onKeyDown={onDotKeyDown}
          data-testid="demo-steps"
        >
          {steps.map((_, dot) => (
            <li key={dot}>
              <button
                type="button"
                ref={(element) => {
                  dots.current[dot] = element;
                }}
                // Roving tabindex: one tab stop for the whole demo, then arrow keys.
                tabIndex={dot === index ? 0 : -1}
                aria-label={`Go to step ${String(dot + 1)}`}
                aria-current={dot === index ? "step" : undefined}
                onClick={() => {
                  goTo(dot, false);
                }}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "block rounded-full transition-all duration-200",
                    dot === index
                      ? "size-2.5 bg-accent"
                      : dot < index
                        ? "size-2 bg-fg-muted"
                        : "size-2 bg-border-strong",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={index === 0}
            onClick={() => {
              goTo(index - 1, false);
            }}
          >
            <ChevronLeft /> Back
          </Button>
          {last ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                goTo(0, false);
              }}
            >
              <RotateCcw /> Replay
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                goTo(index + 1, false);
              }}
            >
              Next <ChevronRight />
            </Button>
          )}
        </div>
      </footer>

      {/* One announcement for the whole step, so a screen reader hears where it is. */}
      <p role="status" aria-live="polite" className="sr-only">
        {`Step ${String(index + 1)} of ${String(steps.length)}. ${step.command ? `${step.command}. ` : ""}${step.caption}`}
      </p>
    </section>
  );
}
