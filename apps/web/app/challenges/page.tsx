import { CHALLENGE_CATEGORIES } from "@gitdojo/challenge-engine";
import { type Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { ChallengeBrowser } from "@/features/challenges/components/ChallengeBrowser";
import { loadChallengeSummaries } from "@/lib/content";

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Real-world Git problems with no step-by-step instructions: a scenario, a mission and a repository to fix.",
};

export default async function ChallengesPage() {
  const challenges = await loadChallengeSummaries();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Challenges</h1>
        <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
          Real-world Git problems. No step-by-step instructions: just a scenario, a mission and a
          repository that needs you.
        </p>
        <ChallengeBrowser challenges={challenges} categories={CHALLENGE_CATEGORIES} />
      </main>
    </>
  );
}
