import { type Metadata } from "next";
import { LessonWorkspace } from "@/features/workspace/components/LessonWorkspace";
import { loadLesson } from "@/lib/lessons";

const DEMO_LESSON = "first-commit";

export async function generateMetadata(): Promise<Metadata> {
  const lesson = await loadLesson(DEMO_LESSON);
  return { title: lesson.title, description: lesson.goal ?? lesson.description };
}

export default async function DemoLessonPage() {
  // Loaded and validated on the server at build time; the client receives plain data.
  const lesson = await loadLesson(DEMO_LESSON);
  return <LessonWorkspace lesson={lesson} />;
}
