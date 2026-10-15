import { HINT_LEVELS, nextHint, visibleHints } from "@gitdojo/hints";
import { type Hint, type HintLevel, type HintState } from "@gitdojo/shared-types";
import { Badge, Button, cn, type BadgeProps } from "@gitdojo/ui";
import { CircleDashed, Lightbulb, ScanSearch } from "lucide-react";
import { useState } from "react";
import { renderInline } from "@/components/content/rich-text";

/** A hint ladder offered because the repository is in a state an author anticipated. */
export interface AdaptiveHint {
  /** The matching rule; another rule starts its own ladder. */
  id: string;
  hints: readonly Hint[];
  state: HintState | undefined;
  onReveal: () => void;
}

export interface HintPanelProps {
  hints: readonly Hint[];
  state: HintState | undefined;
  onReveal: () => void;
  /** Why the current objective is not met yet, straight from its validator. */
  missing?: string | null;
  /** Shown instead of `missing` while an adaptive hint rule matches the current state. */
  adaptive?: AdaptiveHint | null;
  className?: string;
}

const TONES: Record<HintLevel, BadgeProps["tone"]> = { 1: "neutral", 2: "accent", 3: "warning" };

const REVEAL_LABELS: Record<HintLevel, string> = {
  1: "Show a hint",
  2: "Next hint",
  3: "Show the answer",
};

/**
 * Progressive help for the current objective: a concept first, then the command family, and only
 * on request (and a second click) the exact command. When the repository is in a state the author
 * wrote a specific ladder for, that ladder is offered too, "based on your progress".
 */
export function HintPanel({
  hints,
  state,
  onReveal,
  missing,
  adaptive,
  className,
}: HintPanelProps) {
  const [confirming, setConfirming] = useState(false);
  if (hints.length === 0 && !missing && !adaptive) return null;
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
      className={cn("rounded-md border border-border-subtle bg-panel p-3", className)}
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

      {adaptive ? (
        // Keyed by rule: a different rule is a different suggestion, announced afresh.
        <AdaptiveSuggestion key={adaptive.id} adaptive={adaptive} />
      ) : missing ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 flex items-start gap-2 rounded-sm border border-border-subtle bg-surface px-2 py-1.5 text-caption text-fg-muted"
          data-testid="hint-missing"
        >
          <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium text-fg-secondary">Not yet: </span>
            {renderInline(missing)}
          </span>
        </p>
      ) : null}

      {shown.length > 0 ? <HintList hints={shown} /> : null}

      {confirming ? (
        <ConfirmAnswer
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={reveal}
        />
      ) : null}
    </section>
  );
}

/** Its own ladder and answer confirmation, both gone once the rule stops matching. */
function AdaptiveSuggestion({ adaptive }: { adaptive: AdaptiveHint }) {
  const [confirming, setConfirming] = useState(false);
  const shown = visibleHints(adaptive.hints, adaptive.state);
  const next = nextHint(adaptive.hints, adaptive.state);
  const label = next ? REVEAL_LABELS[next.level] : null;

  const reveal = () => {
    if (next?.level === 3 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    adaptive.onReveal();
  };

  return (
    <section
      aria-labelledby="adaptive-hint-heading"
      data-testid="adaptive-hint"
      data-rule={adaptive.id}
      className="mt-2 animate-gd-enter rounded-sm border border-accent-border bg-accent-soft p-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Named in text, so the suggestion never depends on its colour to be understood. */}
          <h3
            id="adaptive-hint-heading"
            className="flex items-center gap-1.5 text-micro font-semibold tracking-wider text-accent uppercase"
          >
            <ScanSearch className="size-3.5" aria-hidden="true" />
            Based on your progress
          </h3>
          {/* A status: it appears in response to what the learner just did. */}
          <p role="status" aria-live="polite" className="mt-1 text-caption text-fg-secondary">
            {shown.length === 0
              ? "There is a hint for the state your repository is in right now."
              : `Hint ${String(shown.length)} of ${String(adaptive.hints.length)}`}
          </p>
        </div>
        {next && label && !confirming ? (
          <Button
            size="sm"
            variant="ghost"
            data-testid="reveal-adaptive-hint"
            // Keeps the visible words, so voice control still finds it, but tells it apart from
            // the objective's own hint button.
            aria-label={`${label} based on your progress`}
            onClick={reveal}
          >
            {label}
          </Button>
        ) : null}
      </div>

      {shown.length > 0 ? <HintList hints={shown} testId="adaptive-hint-step" /> : null}

      {confirming ? (
        <ConfirmAnswer
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={reveal}
        />
      ) : null}
    </section>
  );
}

function HintList({ hints, testId = "hint" }: { hints: readonly Hint[]; testId?: string }) {
  return (
    <ol className="mt-2 space-y-2" aria-live="polite">
      {hints.map((hint, index) => (
        <li
          key={index}
          data-testid={testId}
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
  );
}

function ConfirmAnswer({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      role="group"
      aria-label="Show the answer?"
      className="mt-3 rounded-md border border-warning/30 bg-warning-soft p-2.5"
    >
      <p className="text-caption text-fg-secondary">
        The next hint is the exact command. You will remember it better if you work it out: want one
        more try first?
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Not yet
        </Button>
        <Button size="sm" variant="primary" data-testid="confirm-answer" onClick={onConfirm}>
          Show the answer
        </Button>
      </div>
    </div>
  );
}
