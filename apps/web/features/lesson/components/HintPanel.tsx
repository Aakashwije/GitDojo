import { HINT_LEVELS, nextHint, visibleHints } from "@gitdojo/hints";
import { type Hint, type HintLevel, type HintState } from "@gitdojo/shared-types";
import { Badge, Button, type BadgeProps } from "@gitdojo/ui";
import { CircleDashed, Lightbulb } from "lucide-react";
import { useState } from "react";
import { renderInline } from "@/components/content/rich-text";

export interface HintPanelProps {
  hints: readonly Hint[];
  state: HintState | undefined;
  onReveal: () => void;
  /** Why the current objective is not met yet, straight from its validator. */
  missing?: string | null;
}

const TONES: Record<HintLevel, BadgeProps["tone"]> = { 1: "neutral", 2: "accent", 3: "warning" };

const REVEAL_LABELS: Record<HintLevel, string> = {
  1: "Show a hint",
  2: "Next hint",
  3: "Show the answer",
};

/**
 * Progressive help for the current objective: a concept first, then the command family, and only
 * on request (and a second click) the exact command.
 */
export function HintPanel({ hints, state, onReveal, missing }: HintPanelProps) {
  const [confirming, setConfirming] = useState(false);
  if (hints.length === 0 && !missing) return null;
  const shown = visibleHints(hints, state);
  const next = nextHint(hints, state);

  const reveal = () => {
    // The answer takes a second click: most learners get there with one more try.
    if (next?.level === 3 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onReveal();
  };

  return (
    <section
      aria-labelledby="hints-heading"
      data-testid="hint-panel"
      className="rounded-lg border border-border-subtle bg-panel p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="hints-heading"
          className="flex items-center gap-2 text-small font-medium text-fg-secondary"
        >
          <Lightbulb className="size-4 text-warning" aria-hidden="true" />
          {shown.length === 0
            ? "Need help?"
            : `Hint ${String(shown.length)} of ${String(hints.length)}`}
        </h2>
        {next && !confirming ? (
          <Button size="sm" variant="ghost" data-testid="reveal-hint" onClick={reveal}>
            {REVEAL_LABELS[next.level]}
          </Button>
        ) : null}
      </div>

      {missing ? (
        <p
          className="mt-2 flex items-start gap-2 text-caption text-fg-muted"
          data-testid="hint-missing"
        >
          <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium text-fg-secondary">Not yet: </span>
            {renderInline(missing)}
          </span>
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ol className="mt-2 space-y-2" aria-live="polite">
          {shown.map((hint, index) => (
            <li
              key={index}
              data-testid="hint"
              data-level={hint.level}
              className="flex animate-gd-enter items-start gap-2 text-small text-fg-secondary"
            >
              <Badge
                tone={TONES[hint.level]}
                className="mt-0.5"
                title={HINT_LEVELS[hint.level].description}
              >
                {HINT_LEVELS[hint.level].label}
              </Badge>
              <span>{renderInline(hint.text)}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {confirming ? (
        <div
          role="group"
          aria-label="Show the answer?"
          className="mt-3 rounded-md border border-warning/30 bg-warning-soft p-2.5"
        >
          <p className="text-caption text-fg-secondary">
            The next hint is the exact command. You will remember it better if you work it out: want
            one more try first?
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Not yet
            </Button>
            <Button size="sm" variant="primary" data-testid="confirm-answer" onClick={reveal}>
              Show the answer
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
