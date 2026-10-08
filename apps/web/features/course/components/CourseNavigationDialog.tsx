"use client";

import { type CourseOutline } from "@gitdojo/shared-types";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@gitdojo/ui";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  courseHref,
  courseProgress,
  formatLessonNumber,
  type LessonNeighbors,
} from "../services/course-navigation";
import { useCompletedLessons } from "@/features/progress";
import { CourseOutlineList } from "./CourseOutlineList";
import { CourseProgressBar } from "./CourseProgressBar";

/** Topbar button showing where you are in the course; opens the full lesson list. */
export function CourseNavigationDialog({
  course,
  position,
}: {
  course: CourseOutline;
  position: LessonNeighbors;
}) {
  const [open, setOpen] = useState(false);
  const { completed } = useCompletedLessons();
  const progress = courseProgress(course, completed);
  const { lesson } = position;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="course-navigation"
          className="group flex min-w-0 cursor-pointer flex-col items-start rounded-md px-2 py-1 text-left transition-colors hover:bg-hover"
        >
          <span className="flex items-center gap-1 text-caption text-fg-muted">
            {course.title}
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Lesson {formatLessonNumber(lesson.number)} of {course.lessons.length}
            </span>
            <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
          </span>
          <span className="max-w-full truncate text-small font-semibold text-fg">
            {lesson.title}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[520px] p-5">
        <DialogTitle>{course.title}</DialogTitle>
        <DialogDescription>{course.description}</DialogDescription>
        <CourseProgressBar progress={progress} className="mt-4" />
        <nav aria-label="Course lessons" className="-mx-2 mt-4 max-h-[60dvh] overflow-y-auto px-2">
          <CourseOutlineList
            course={course}
            completed={completed}
            currentLessonId={lesson.id}
            activeLessonId={lesson.id}
            onNavigate={() => {
              setOpen(false);
            }}
          />
        </nav>
        <Link
          href={courseHref(course.slug)}
          className="mt-4 inline-block text-caption text-fg-muted hover:text-fg"
          onClick={() => {
            setOpen(false);
          }}
        >
          Course overview
        </Link>
      </DialogContent>
    </Dialog>
  );
}
