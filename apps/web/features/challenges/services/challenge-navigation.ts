import { type ChallengeSummary } from "@gitdojo/shared-types";

export function challengeHref(id: string): string {
  return `/challenges/${id}`;
}

/** Where a challenge workspace sits among all challenges. */
export interface ChallengeContext {
  summary: ChallengeSummary;
  categoryTitle: string;
  /** The next playable challenge, if any. */
  next: ChallengeSummary | null;
}

export function isPlayable(summary: ChallengeSummary): boolean {
  return summary.missingCommands.length === 0;
}

/** The first playable challenge after `id`, wrapping around; `null` when there is none. */
export function nextChallenge(
  summaries: readonly ChallengeSummary[],
  id: string,
): ChallengeSummary | null {
  const index = summaries.findIndex((summary) => summary.id === id);
  const ordered = [...summaries.slice(index + 1), ...summaries.slice(0, Math.max(index, 0))];
  return ordered.find(isPlayable) ?? null;
}

/** "git reset" and "git stash" → "git reset and git stash". */
export function describeMissing(commands: readonly string[]): string {
  const names = commands.map((command) => `git ${command}`);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}
