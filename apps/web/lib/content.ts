import "server-only";

import {
  loadAllChallenges,
  loadChallenge as loadChallengeFromSource,
  toChallengeSummary,
} from "@gitdojo/challenge-engine";
import { loadAllScenarios } from "@gitdojo/lesson-engine";
import { createDirectoryLessonSource } from "@gitdojo/lesson-engine/node";
import {
  type ChallengeDefinition,
  type ChallengeSummary,
  type PlaygroundScenario,
} from "@gitdojo/shared-types";
import path from "node:path";

// Content is read and validated at build time; invalid YAML fails `next build`.
export const CONTENT_DIR = path.join(process.cwd(), "..", "..", "content");

/** Playground scenarios from `content/playground/`, in display order. */
export function loadPlaygroundScenarios(): Promise<PlaygroundScenario[]> {
  return loadAllScenarios(createDirectoryLessonSource(path.join(CONTENT_DIR, "playground")));
}

const challenges = createDirectoryLessonSource(path.join(CONTENT_DIR, "challenges"));

/** Every challenge, in browser order (by category, then `order`). */
export function loadChallenges(): Promise<ChallengeDefinition[]> {
  return loadAllChallenges(challenges);
}

export function loadChallenge(id: string): Promise<ChallengeDefinition> {
  return loadChallengeFromSource(id, challenges);
}

/** Summaries for the browser, numbered across all challenges, with availability. */
export async function loadChallengeSummaries(): Promise<ChallengeSummary[]> {
  return (await loadChallenges()).map((challenge, index) =>
    toChallengeSummary(challenge, index + 1),
  );
}
