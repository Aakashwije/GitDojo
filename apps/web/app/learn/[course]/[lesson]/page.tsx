import { toCourseOutline } from "@gitdojo/lesson-engine";
import { lessonTypeOf } from "@gitdojo/shared-types";
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { ConceptLesson } from "@/features/workspace/components/ConceptLesson";
import { LessonWorkspace } from "@/features/workspace/components/LessonWorkspace";
import { loadAllCourses, loadCourse } from "@/lib/lessons";

interface LessonPageProps {
  params: Promise<{ course: string; lesson: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadAllCourses()).flatMap(({ course }) =>
    course.lessons.map((lesson) => ({ course: course.slug, lesson })),
  );
}

async function load(params: LessonPageProps["params"]) {
  const { course: courseSlug, lesson: lessonSlug } = await params;
  const loaded = await loadCourse(courseSlug);
  const lesson = loaded.lessons.find((candidate) => candidate.slug === lessonSlug);
  if (!lesson) notFound();
  return { lesson, course: toCourseOutline(loaded) };
}

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { lesson, course } = await load(params);
  return {
    title: `${lesson.title} · ${course.title}`,
    description: lesson.goal ?? lesson.description,
  };
}

export default async function LessonPage({ params }: LessonPageProps) {
  // Loaded and validated on the server at build time; the client receives plain data.
  const { lesson, course } = await load(params);
  // Keyed by lesson so moving to the next lesson starts a fresh session and terminal.
  return lessonTypeOf(lesson) === "concept" ? (
    <ConceptLesson key={lesson.id} lesson={lesson} course={course} />
  ) : (
    <LessonWorkspace key={lesson.id} lesson={lesson} course={course} />
  );
}
