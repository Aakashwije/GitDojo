import { isSupportedGitCommand } from "@gitdojo/command-parser";
import { formatIssue, InvalidLessonError, type LessonSource } from "@gitdojo/lesson-engine";
import {
  type LessonDefinition,
  type LessonDifficulty,
  type PracticeTaskDefinition,
  type PracticeTaskSummary,
} from "@gitdojo/shared-types";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { missingCommands } from "./challenge";
import { practiceTaskSchema } from "./practice-schema";

export class PracticeTaskNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Practice task "${id}" was not found`);
    this.name = "PracticeTaskNotFoundError";
  }
}

export const PRACTICE_DIFFICULTIES: readonly LessonDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

export function parsePracticeTask(
  yamlSource: string,
  origin = "practice task",
): PracticeTaskDefinition {
  let data: unknown;
  try {
    data = parseYaml(yamlSource);
  } catch (error) {
    if (error instanceof YAMLParseError) throw new InvalidLessonError(origin, [error.message]);
    throw error;
  }
  const result = practiceTaskSchema.safeParse(data);
  if (!result.success) throw new InvalidLessonError(origin, result.error.issues.map(formatIssue));
  return result.data;
}

export async function loadPracticeTask(
  id: string,
  source: LessonSource,
): Promise<PracticeTaskDefinition> {
  const yamlSource = await source.read(id);
  if (yamlSource === null) throw new PracticeTaskNotFoundError(id);
  const task = parsePracticeTask(yamlSource, `${id}.yaml`);
  if (task.id !== id) {
    throw new InvalidLessonError(`${id}.yaml`, [
      `id "${task.id}" does not match the file name "${id}"`,
    ]);
  }
  return task;
}

/** Every task: beginner first, then by `order`, then title. */
export async function loadAllPracticeTasks(
  source: LessonSource,
): Promise<PracticeTaskDefinition[]> {
  const tasks = await Promise.all((await source.list()).map((id) => loadPracticeTask(id, source)));
  return tasks.sort(
    (a, b) =>
      PRACTICE_DIFFICULTIES.indexOf(a.difficulty) - PRACTICE_DIFFICULTIES.indexOf(b.difficulty) ||
      (a.order ?? 0) - (b.order ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

export function toPracticeSummary(
  task: PracticeTaskDefinition,
  isSupported: (command: string) => boolean = isSupportedGitCommand,
): PracticeTaskSummary {
  return {
    id: task.id,
    title: task.title,
    skill: task.skill,
    difficulty: task.difficulty,
    mission: task.mission,
    missingCommands: missingCommands(task, isSupported),
    ...(task.related ? { related: task.related } : {}),
  };
}

/**
 * A task as a lesson of type `challenge`, so the workspace's setup and validation run it. The
 * checks become objectives the learner never sees; there are no hints, tips or adaptive hints.
 */
export function practiceToLessonDefinition(task: PracticeTaskDefinition): LessonDefinition {
  return {
    id: task.id,
    slug: task.id,
    title: task.title,
    type: "challenge",
    goal: task.mission,
    description: task.scenario,
    difficulty: task.difficulty,
    concepts: task.concepts,
    setup: task.setup,
    objectives: task.checks.map((validator, index) => ({
      id: `check-${String(index + 1)}`,
      description: `Check ${String(index + 1)}`,
      validator,
    })),
  };
}
