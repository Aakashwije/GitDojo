import { Button } from "@gitdojo/ui";
import { Lightbulb } from "lucide-react";
import { renderInline } from "./RichText";

export interface HintPanelProps {
  hints: readonly string[];
  revealed: number;
  onReveal: () => void;
}

/** Progressive hints for the current objective: vague first, the exact command last. */
export function HintPanel({ hints, revealed, onReveal }: HintPanelProps) {
  if (hints.length === 0) return null;
  const shown = Math.min(revealed, hints.length);

  return (
    <section
      aria-labelledby="hints-heading"
      className="rounded-lg border border-border-subtle bg-panel p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="hints-heading"
          className="flex items-center gap-2 text-small font-medium text-fg-secondary"
        >
          <Lightbulb className="size-4 text-warning" aria-hidden="true" />
          {shown === 0 ? "Need help?" : `Hint ${String(shown)} of ${String(hints.length)}`}
        </h2>
        {shown < hints.length ? (
          <Button size="sm" variant="ghost" onClick={onReveal}>
            {shown === 0 ? "Reveal hint" : "Next hint"}
          </Button>
        ) : null}
      </div>
      {shown > 0 ? (
        <ol className="mt-2 space-y-2" aria-live="polite">
          {hints.slice(0, shown).map((hint, index) => (
            <li key={index} className="animate-gd-enter text-small text-fg-secondary">
              {renderInline(hint)}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
