import { type LessonDefinition, type LessonValidationResult } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { advanceProgress, createInitialProgress } from "./progress";

const lesson: LessonDefinition = {
  id: "l",
  slug: "l",
  title: "L",
  difficulty: "beginner",
  concepts: [],
  setup: {},
  objectives: [
    { id: "init", description: "", validator: { type: "repository_initialized" } },
    { id: "stage", description: "", validator: { type: "file_staged", file: "README.md" } },
    { id: "commit", description: "", validator: { type: "commit_exists" } },
  ],
};

function validation(passed: Record<string, boolean>): LessonValidationResult {
  const objectives = lesson.objectives.map((objective) => ({
    objectiveId: objective.id,
    passed: passed[objective.id] ?? false,
  }));
  const passedCount = objectives.filter((objective) => objective.passed).length;
  return {
    lessonId: lesson.id,
    objectives,
    passedCount,
    totalCount: objectives.length,
    completed: passedCount === objectives.length,
  };
}

describe("lesson progress", () => {
  it("starts at the first objective", () => {
    expect(createInitialProgress(lesson)).toEqual({
      lessonId: "l",
      completedObjectiveIds: [],
      currentObjectiveId: "init",
      completed: false,
    });
  });

  it("keeps objectives completed after the state moves on", () => {
    let progress = createInitialProgress(lesson);
    progress = advanceProgress(lesson, progress, validation({ init: true }));
    progress = advanceProgress(lesson, progress, validation({ init: true, stage: true }));
    expect(progress.currentObjectiveId).toBe("commit");
    // After committing, README.md is no longer staged, but the objective stays achieved.
    progress = advanceProgress(lesson, progress, validation({ init: true, commit: true }));
    expect(progress).toEqual({
      lessonId: "l",
      completedObjectiveIds: ["init", "stage", "commit"],
      currentObjectiveId: null,
      completed: true,
    });
  });

  it("completes objectives in order only", () => {
    let progress = createInitialProgress(lesson);
    // "commit" passes, but "init" and "stage" have not been achieved yet.
    progress = advanceProgress(lesson, progress, validation({ commit: true }));
    expect(progress.completedObjectiveIds).toEqual([]);
    progress = advanceProgress(lesson, progress, validation({ init: true, commit: true }));
    expect(progress.completedObjectiveIds).toEqual(["init"]);
    // Several objectives can complete in one step when they all pass in order.
    progress = advanceProgress(
      lesson,
      progress,
      validation({ init: true, stage: true, commit: true }),
    );
    expect(progress.completed).toBe(true);
  });
});
