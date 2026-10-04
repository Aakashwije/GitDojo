import { isSupportedGitCommand } from "@gitdojo/command-parser";
import { formatIssue, InvalidLessonError, type LessonSource } from "@gitdojo/lesson-engine";
import {
  type ChallengeDefinition,
  type ChallengeSummary,
  type LessonDefinition,
} from "@gitdojo/shared-types";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { CHALLENGE_CATEGORIES } from "./categories";
import { challengeDefinitionSchema } from "./schema";

export class ChallengeNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Challenge "${id}" was not found`);
    this.name = "ChallengeNotFoundError";
  }
}

export function parseChallenge(yamlSource: string, origin = "challenge"): ChallengeDefinition {
  let data: unknown;
  try {
    data = parseYaml(yamlSource);
  } catch (error) {
    if (error instanceof YAMLParseError) throw new InvalidLessonError(origin, [error.message]);
    throw error;
  }
  const result = challengeDefinitionSchema.safeParse(data);
  if (!result.success) throw new InvalidLessonError(origin, result.error.issues.map(formatIssue));
  return result.data;
}

export async function loadChallenge(
  id: string,
  source: LessonSource,
): Promise<ChallengeDefinition> {
  const yamlSource = await source.read(id);
  if (yamlSource === null) throw new ChallengeNotFoundError(id);
  const challenge = parseChallenge(yamlSource, `${id}.yaml`);
  if (challenge.id !== id) {
    throw new InvalidLessonError(`${id}.yaml`, [
      `id "${challenge.id}" does not match the file name "${id}"`,
    ]);
  }
  return challenge;
}

const categoryOrder = new Map(CHALLENGE_CATEGORIES.map((category, index) => [category.id, index]));

/** Every challenge, by category (in browser order), then `order`, then title. */
export async function loadAllChallenges(source: LessonSource): Promise<ChallengeDefinition[]> {
  const challenges = await Promise.all(
    (await source.list()).map((id) => loadChallenge(id, source)),
  );
  return challenges.sort(
    (a, b) =>
      (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0) ||
      (a.order ?? 0) - (b.order ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

/** Required commands GitDojo cannot run yet. A challenge is playable when this is empty. */
export function missingCommands(
  challenge: Pick<ChallengeDefinition, "requires">,
  isSupported: (command: string) => boolean = isSupportedGitCommand,
): string[] {
  return (challenge.requires ?? []).filter((command) => !isSupported(command));
}

export function toChallengeSummary(
  challenge: ChallengeDefinition,
  number: number,
  isSupported?: (command: string) => boolean,
): ChallengeSummary {
  return {
    id: challenge.id,
    title: challenge.title,
    category: challenge.category,
    difficulty: challenge.difficulty,
    mission: challenge.mission,
    concepts: challenge.concepts,
    number,
    missingCommands: missingCommands(challenge, isSupported),
  };
}

/**
 * A challenge as a lesson of type `challenge`, so the lesson workspace, setup, validation and
 * progress machinery run it unchanged. The mission becomes the goal; the scenario the description.
 */
export function toLessonDefinition(challenge: ChallengeDefinition): LessonDefinition {
  return {
    id: challenge.id,
    slug: challenge.id,
    title: challenge.title,
    type: "challenge",
    goal: challenge.mission,
    description: challenge.scenario,
    difficulty: challenge.difficulty,
    concepts: challenge.concepts,
    commands: challenge.requires?.map((command) => `git ${command}`),
    setup: challenge.setup,
    objectives: challenge.objectives,
    ...(challenge.hints ? { hints: challenge.hints } : {}),
  };
}
