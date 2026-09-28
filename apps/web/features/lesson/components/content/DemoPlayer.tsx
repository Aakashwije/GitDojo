"use client";

import { type DemoStep } from "@gitdojo/shared-types";
import { Button, cn } from "@gitdojo/ui";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { renderInline } from "../RichText";
import { LessonVisualView } from "./LessonVisualView";
import { CommandLine } from "./ContentBlocks";

/** A mini visual demonstration the learner steps through at their own pace. */
export function DemoPlayer({ title, steps }: { title?: string; steps: DemoStep[] }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  if (!step) return null;
  const last = index === steps.length - 1;

  return (
    <section
      aria-roledescription="demonstration"
      aria-label={title ?? "Demonstration"}
      data-testid="demo-player"
      className="rounded-lg border border-border bg-panel"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
        <p className="text-small font-semibold text-fg">{title ?? "Try it step by step"}</p>
        <p className="shrink-0 font-mono text-caption text-fg-muted" data-testid="demo-step">
          Step {index + 1} of {steps.length}
        </p>
      </header>

      <div className="space-y-3 p-4">
        {step.command ? <CommandLine command={step.command} /> : null}
        <LessonVisualView visual={step} />
        <p aria-live="polite" className="text-small text-fg-secondary">
          {renderInline(step.caption)}
        </p>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-2.5">
        <ol className="flex items-center gap-1.5" aria-label="Steps">
          {steps.map((_, dot) => (
            <li key={dot}>
              <button
                type="button"
                aria-label={`Go to step ${String(dot + 1)}`}
                aria-current={dot === index ? "step" : undefined}
                onClick={() => {
                  setIndex(dot);
                }}
                className={cn(
                  "block size-2 cursor-pointer rounded-full transition-colors",
                  dot === index ? "bg-accent" : dot < index ? "bg-fg-muted" : "bg-border-strong",
                )}
              />
            </li>
          ))}
        </ol>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={index === 0}
            onClick={() => {
              setIndex(index - 1);
            }}
          >
            <ChevronLeft /> Back
          </Button>
          {last ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setIndex(0);
              }}
            >
              <RotateCcw /> Replay
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setIndex(index + 1);
              }}
            >
              Next <ChevronRight />
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}
