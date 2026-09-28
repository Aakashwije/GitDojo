import { type Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { CourseCard } from "@/features/course/components/CourseCard";
import { toCourseOutline } from "@gitdojo/lesson-engine";
import { loadAllCourses } from "@/lib/lessons";

export const metadata: Metadata = {
  title: "Learn Git",
  description: "Master the fundamentals, then tackle real-world Git workflows.",
};

export default async function LearnPage() {
  const courses = (await loadAllCourses()).map(toCourseOutline);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Learn Git</h1>
        <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
          Master the fundamentals, then tackle real-world Git workflows.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
        <p className="mt-10 text-small text-fg-muted">
          Short on time?{" "}
          <Link href="/learn/demo" className="text-fg-secondary underline hover:text-fg">
            Try the five-minute demo lesson
          </Link>
          .
        </p>
      </main>
    </>
  );
}
