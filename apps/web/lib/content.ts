import "server-only";

import {
  loadAllChallenges,
  loadAllPracticeTasks,
  loadChallenge as loadChallengeFromSource,
  loadPracticeTask as loadPracticeTaskFromSource,
  toChallengeSummary,
  toPracticeSummary,
} from "@gitdojo/challenge-engine";
import { loadAllScenarios } from "@gitdojo/lesson-engine";
import { createDirectoryLessonSource } from "@gitdojo/lesson-engine/node";
import {
  type ChallengeDefinition,
  type ChallengeSummary,
  type PlaygroundScenario,
  type PracticeTaskDefinition,
  type PracticeTaskSummary,
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

const practice = createDirectoryLessonSource(path.join(CONTENT_DIR, "practice"));

/** Every Practice mode task, beginner first. */
export function loadPracticeTasks(): Promise<PracticeTaskDefinition[]> {
  return loadAllPracticeTasks(practice);
}

export function loadPracticeTask(id: string): Promise<PracticeTaskDefinition> {
  return loadPracticeTaskFromSource(id, practice);
}

/** Summaries for the Practice browser, with availability. */
export async function loadPracticeSummaries(): Promise<PracticeTaskSummary[]> {
  return (await loadPracticeTasks()).map((task) => toPracticeSummary(task));
}
