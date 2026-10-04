import { categoryInfo, toLessonDefinition } from "@gitdojo/challenge-engine";
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { ChallengeLocked } from "@/features/challenges/components/ChallengeLocked";
import { isPlayable, nextChallenge } from "@/features/challenges/services/challenge-navigation";
import { LessonWorkspace } from "@/features/workspace/components/LessonWorkspace";
import { loadChallenge, loadChallengeSummaries, loadChallenges } from "@/lib/content";

interface ChallengePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadChallenges()).map((challenge) => ({ slug: challenge.id }));
}

async function load(params: ChallengePageProps["params"]) {
  const { slug } = await params;
  const summaries = await loadChallengeSummaries();
  const summary = summaries.find((candidate) => candidate.id === slug);
  if (!summary) notFound();
  return { challenge: await loadChallenge(slug), summary, summaries };
}

export async function generateMetadata({ params }: ChallengePageProps): Promise<Metadata> {
  const { challenge } = await load(params);
  return { title: `${challenge.title} · Challenges`, description: challenge.mission };
}

export default async function ChallengePage({ params }: ChallengePageProps) {
  // Loaded and validated on the server at build time; the client receives plain data.
  const { challenge, summary, summaries } = await load(params);
  if (!isPlayable(summary)) return <ChallengeLocked challenge={summary} />;
  return (
    <LessonWorkspace
      key={challenge.id}
      lesson={toLessonDefinition(challenge)}
      challenge={{
        summary,
        categoryTitle: categoryInfo(challenge.category).title,
        next: nextChallenge(summaries, challenge.id),
      }}
    />
  );
}
