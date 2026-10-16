import { practiceToLessonDefinition } from "@gitdojo/challenge-engine";
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { PracticeWorkspace } from "@/features/practice/components/PracticeWorkspace";
import { loadPracticeSummaries, loadPracticeTask, loadPracticeTasks } from "@/lib/content";
import { loadCourse } from "@/lib/lessons";

interface PracticeTaskPageProps {
  params: Promise<{ task: string }>;
}

// Only tasks that exist: any other id is a 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadPracticeTasks()).map((task) => ({ task: task.id }));
}

async function load(params: PracticeTaskPageProps["params"]) {
  const { task: id } = await params;
  const summaries = await loadPracticeSummaries();
  const summary = summaries.find((candidate) => candidate.id === id);
  if (!summary) notFound();
  return { task: await loadPracticeTask(id), summary, summaries };
}

/** The related lesson's title and route; the content tests make sure it exists. */
async function relatedLesson(related: { course: string; lesson: string } | undefined) {
  if (!related) return null;
  const { course, lessons } = await loadCourse(related.course);
  const lesson = lessons.find((candidate) => candidate.slug === related.lesson);
  return lesson ? { href: `/learn/${course.slug}/${lesson.slug}`, title: lesson.title } : null;
}

export async function generateMetadata({ params }: PracticeTaskPageProps): Promise<Metadata> {
  const { task } = await load(params);
  return { title: `${task.title} · Practice`, description: task.mission };
}

export default async function PracticeTaskPage({ params }: PracticeTaskPageProps) {
  // Loaded and validated on the server at build time; the client receives plain data.
  const { task, summary, summaries } = await load(params);
  if (summary.missingCommands.length > 0) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-[720px] px-4 py-16 sm:px-6">
          <h1 className="text-h2 font-semibold text-fg">{task.title}</h1>
          <p className="mt-3 text-body text-fg-secondary">
            This task needs Git commands GitDojo cannot run yet:{" "}
            {summary.missingCommands.map((command) => `git ${command}`).join(", ")}.
          </p>
        </main>
      </>
    );
  }
  return (
    <PracticeWorkspace
      key={task.id}
      lesson={practiceToLessonDefinition(task)}
      task={summary}
      scenario={task.scenario}
      tasks={summaries}
      related={await relatedLesson(task.related)}
    />
  );
}
