import { type LessonDefinition, type LessonValidationResult } from "@gitdojo/shared-types";

export interface LessonProgress {
  lessonId: string;
  /** Objectives achieved at any point in this attempt, in lesson order. */
  completedObjectiveIds: string[];
  /** First objective not yet achieved, or `null` when the lesson is complete. */
  currentObjectiveId: string | null;
  completed: boolean;
}

function buildProgress(lesson: LessonDefinition, completed: Set<string>): LessonProgress {
  const completedObjectiveIds = lesson.objectives
    .map((objective) => objective.id)
    .filter((id) => completed.has(id));
  const current = lesson.objectives.find((objective) => !completed.has(objective.id));
  return {
    lessonId: lesson.id,
    completedObjectiveIds,
    currentObjectiveId: current?.id ?? null,
    completed: current === undefined,
  };
}

export function createInitialProgress(lesson: LessonDefinition): LessonProgress {
  return buildProgress(lesson, new Set());
}

/**
 * Objectives are sticky: once achieved they stay achieved until the lesson is reset.
 * Validators only describe the current state, and later steps legitimately undo earlier ones
 * (committing empties the staging area, so "README.md is staged" stops being true).
 */
export function advanceProgress(
  lesson: LessonDefinition,
  previous: LessonProgress,
  validation: LessonValidationResult,
): LessonProgress {
  const completed = new Set(previous.completedObjectiveIds);
  for (const objective of validation.objectives) {
    if (objective.passed) completed.add(objective.objectiveId);
  }
  return buildProgress(lesson, completed);
}
