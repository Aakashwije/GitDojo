import { type Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { PracticeBrowser } from "@/features/practice/components/PracticeBrowser";
import { loadPracticeSummaries } from "@/lib/content";

export const metadata: Metadata = {
  title: "Practice",
  description:
    "Short Git tasks with no step-by-step instructions: pick a topic or let GitDojo surprise you.",
};

export default async function PracticePage() {
  const tasks = await loadPracticeSummaries();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Practice</h1>
        <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
          Short tasks, one skill each. No objectives, no hints: a scenario, a mission and a
          repository. GitDojo checks the end state, however you get there.
        </p>
        <PracticeBrowser tasks={tasks} />
      </main>
    </>
  );
}
