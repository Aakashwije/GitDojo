import { toCourseOutline } from "@gitdojo/lesson-engine";
import { Badge } from "@gitdojo/ui";
import { ArrowLeft } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { CourseOverview } from "@/features/course/components/CourseOverview";
import { loadAllCourses, loadCourse } from "@/lib/lessons";

interface CoursePageProps {
  params: Promise<{ course: string }>;
}

// Every course is known at build time; anything else is a 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadAllCourses()).map(({ course }) => ({ course: course.slug }));
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { course } = await loadCourse((await params).course);
  return { title: course.title, description: course.description };
}

export default async function CoursePage({ params }: CoursePageProps) {
  const outline = toCourseOutline(await loadCourse((await params).course));
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-small text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> All courses
        </Link>
        <div className="mt-6 flex items-center gap-2">
          <Badge tone="neutral">{outline.difficulty}</Badge>
          <span className="text-caption text-fg-muted">{outline.lessons.length} lessons</span>
        </div>
        <h1 className="mt-3 text-h2 font-semibold tracking-tight text-fg sm:text-h1">
          {outline.title}
        </h1>
        <p className="mt-3 text-body-lg text-fg-secondary">{outline.description}</p>
        <CourseOverview course={outline} className="mt-8" />
      </main>
    </>
  );
}
