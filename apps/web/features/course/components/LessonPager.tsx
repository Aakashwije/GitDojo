import { Button, cn } from "@gitdojo/ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { courseHref, lessonHref, type LessonNeighbors } from "../services/course-navigation";

export interface LessonPagerProps {
  courseSlug: string;
  position: LessonNeighbors;
  /** Emphasize "next" once the current lesson is done. */
  emphasizeNext?: boolean;
  className?: string;
}

/** Previous / next lesson links. The last lesson links back to the course overview. */
export function LessonPager({ courseSlug, position, emphasizeNext, className }: LessonPagerProps) {
  const { previous, next } = position;
  return (
    <nav aria-label="Lesson navigation" className={cn("flex items-stretch gap-2", className)}>
      {previous ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-auto min-w-0 flex-1 justify-start py-1.5"
        >
          <Link
            href={lessonHref(courseSlug, previous.slug)}
            rel="prev"
            data-testid="previous-lesson"
          >
            <ArrowLeft />
            <span className="min-w-0 text-left">
              <span className="block text-micro text-fg-muted uppercase">Previous</span>
              <span className="block truncate">{previous.title}</span>
            </span>
          </Link>
        </Button>
      ) : (
        <span className="flex-1" />
      )}
      <Button
        asChild
        variant={emphasizeNext ? "primary" : "secondary"}
        size="sm"
        className="h-auto min-w-0 flex-1 justify-end py-1.5"
      >
        {next ? (
          <Link href={lessonHref(courseSlug, next.slug)} rel="next" data-testid="next-lesson">
            <span className="min-w-0 text-right">
              <span
                className={cn(
                  "block text-micro uppercase",
                  emphasizeNext ? "text-white/80" : "text-fg-muted",
                )}
              >
                Next
              </span>
              <span className="block truncate">{next.title}</span>
            </span>
            <ArrowRight />
          </Link>
        ) : (
          <Link href={courseHref(courseSlug)} data-testid="next-lesson">
            <span className="min-w-0 text-right">
              <span
                className={cn(
                  "block text-micro uppercase",
                  emphasizeNext ? "text-white/80" : "text-fg-muted",
                )}
              >
                Finish
              </span>
              <span className="block truncate">Back to course</span>
            </span>
            <ArrowRight />
          </Link>
        )}
      </Button>
    </nav>
  );
}
