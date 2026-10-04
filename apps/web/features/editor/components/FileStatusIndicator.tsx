import { cn, Tooltip } from "@gitdojo/ui";
import { type FileIndicator, type FileIndicatorTone } from "../services/file-status";

const TONES: Record<FileIndicatorTone, string> = {
  muted: "text-fg-muted",
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
};

/** The one-letter Git status (U, M, A, D, C), with its meaning for screen readers. */
export function FileStatusIndicator({
  indicator,
  className,
}: {
  indicator: FileIndicator | null;
  className?: string;
}) {
  if (!indicator) return null;
  return (
    <Tooltip content={indicator.label}>
      <span
        data-testid="file-status"
        data-letter={indicator.letter}
        className={cn(
          "w-3 shrink-0 text-center font-mono text-micro font-semibold",
          TONES[indicator.tone],
          className,
        )}
      >
        <span aria-hidden="true">{indicator.letter}</span>
        <span className="sr-only">{indicator.label}</span>
      </span>
    </Tooltip>
  );
}
