import { cn } from "@gitdojo/ui";
import { type CourseProgress } from "../services/course-navigation";

/** Thin course progress line with a "3 of 10 lessons · 30%" summary. */
export function CourseProgressBar({
  progress,
  className,
}: {
  progress: CourseProgress;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="flex items-baseline justify-between gap-3 text-caption text-fg-muted">
        <span>
          <span className="font-mono text-fg-secondary">{progress.completedCount}</span> of{" "}
          {progress.total} lessons
        </span>
        <span className="font-mono text-fg-secondary" data-testid="course-percent">
          {progress.percent}%
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="Course progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="h-1.5 overflow-hidden rounded-full bg-border-strong"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${String(progress.percent)}%` }}
        />
      </div>
    </div>
  );
}
