"use client";

import { type CourseOutline } from "@gitdojo/shared-types";
import { Badge, Button } from "@gitdojo/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  courseHref,
  courseProgress,
  lessonHref,
  nextLessonToStudy,
} from "../services/course-navigation";
import { useCompletedLessons } from "@/features/progress/state/use-progress-store";
import { CourseProgressBar } from "./CourseProgressBar";

export function CourseCard({ course }: { course: CourseOutline }) {
  const { completed } = useCompletedLessons();
  const progress = courseProgress(course, completed);
  const next = nextLessonToStudy(course, completed);
  const action = progress.completedCount === 0 ? "Start" : next === null ? "Review" : "Continue";

  return (
    <article
      data-testid="course-card"
      className="flex flex-col rounded-xl border border-border bg-panel p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong"
    >
      <div className="flex items-center gap-2">
        <Badge tone="neutral">{course.difficulty}</Badge>
        <span className="text-caption text-fg-muted">{course.lessons.length} lessons</span>
      </div>
      <h2 className="mt-3 text-h3 font-semibold text-fg">
        <Link href={courseHref(course.slug)} className="hover:underline">
          {course.title}
        </Link>
      </h2>
      <p className="mt-2 flex-1 text-small text-fg-secondary">{course.description}</p>
      <CourseProgressBar progress={progress} className="mt-5" />
      <Button
        asChild
        variant={action === "Review" ? "secondary" : "primary"}
        className="mt-5 self-start"
      >
        <Link href={next ? lessonHref(course.slug, next.slug) : courseHref(course.slug)}>
          {action} <ArrowRight />
        </Link>
      </Button>
    </article>
  );
}
