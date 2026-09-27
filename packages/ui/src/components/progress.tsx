import { cn } from "../lib/cn";

export interface SegmentedProgressProps {
  value: number;
  total: number;
  className?: string;
  label: string;
}

/** Thin segmented progress line: one segment per step. */
export function SegmentedProgress({ value, total, className, label }: SegmentedProgressProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      className={cn("flex h-1 w-full gap-1", className)}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-full flex-1 rounded-full transition-colors duration-300 ease-out",
            index < value ? "bg-accent" : "bg-border-strong",
          )}
        />
      ))}
    </div>
  );
}
