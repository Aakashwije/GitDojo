import { type CourseOutline } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import {
  formatLessonNumber,
  lessonHref,
  lessonStatus,
  type LessonStatus,
} from "../services/course-navigation";
import { LessonTypeBadge } from "./LessonTypeBadge";

const STATUS_LABEL: Record<LessonStatus, string> = {
  completed: "completed",
  current: "current lesson",
  upcoming: "not started",
};

export interface CourseOutlineListProps {
  course: CourseOutline;
  completed: ReadonlySet<string>;
  /** The lesson being viewed, or on the course page the next lesson to study. */
  currentLessonId: string | null;
  /** The lesson being viewed, marked with `aria-current="page"`. */
  activeLessonId?: string | null;
  onNavigate?: () => void;
}

/**
 * The course as a numbered list:
 *
 *   01 ✓ What is Git?
 *   03 → Initialize a Repository
 *   04   Understanding git status
 */
export function CourseOutlineList({
  course,
  completed,
  currentLessonId,
  activeLessonId = null,
  onNavigate,
}: CourseOutlineListProps) {
  return (
    <ol aria-label={`${course.title} lessons`} className="space-y-0.5">
      {course.lessons.map((lesson) => {
        const status = lessonStatus(lesson, completed, currentLessonId);
        const active = lesson.id === activeLessonId;
        return (
          <li key={lesson.id}>
            <Link
              href={lessonHref(course.slug, lesson.slug)}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              data-testid="course-lesson"
              data-status={status}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2 text-small transition-colors",
                active || (status === "current" && activeLessonId === null)
                  ? "border-accent-border bg-accent-soft text-fg"
                  : "border-transparent hover:bg-hover",
                status === "completed" && !active && "text-fg-secondary",
                status === "upcoming" && !active && "text-fg-muted",
              )}
            >
              <span className="w-5 shrink-0 font-mono text-caption text-fg-muted">
                {formatLessonNumber(lesson.number)}
              </span>
              <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
                {status === "completed" ? (
                  <Check className="size-4 text-success" />
                ) : status === "current" ? (
                  <ArrowRight className="size-4 text-accent" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {lesson.title}
                <span className="sr-only"> ({STATUS_LABEL[status]})</span>
              </span>
              {lesson.type === "interactive" ? null : <LessonTypeBadge type={lesson.type} />}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
