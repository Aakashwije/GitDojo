import { createInitialProgress } from "@gitdojo/lesson-engine";
import { type AdaptiveHintRecommendation, type LessonDefinition } from "@gitdojo/shared-types";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLessonStore } from "../state/use-lesson-store";
import { LessonPanel } from "./LessonPanel";

const lesson: LessonDefinition = {
  id: "git-commit",
  slug: "git-commit",
  title: "Create Your First Commit",
  difficulty: "beginner",
  concepts: [],
  setup: {},
  objectives: [
    {
      id: "stage",
      description: "Stage README.md.",
      validator: { type: "file_staged", file: "README.md" },
    },
    { id: "commit", description: "Commit it.", validator: { type: "commit_exists" } },
  ],
  hints: { commit: ["Commits record what is staged.", 'Run `git commit -m "Add README"`.'] },
  adaptiveHints: [
    {
      id: "staged-not-committed",
      objective: "commit",
      when: [{ type: "file_staged", file: "README.md" }],
      hints: ["README.md is staged; only the commit is missing.", "Run `git commit`."],
    },
  ],
};

/** Puts the store where a session would after the learner staged README.md. */
function evaluate(adaptiveHint: AdaptiveHintRecommendation | null) {
  const progress = {
    ...createInitialProgress(lesson),
    completedObjectiveIds: ["stage"],
    currentObjectiveId: "commit",
  };
  const validation = {
    lessonId: lesson.id,
    objectives: [
      { objectiveId: "stage", passed: true },
      { objectiveId: "commit", passed: false, reason: "There are no commits yet." },
    ],
    passedCount: 1,
    totalCount: 2,
    completed: false,
  };
  act(() => {
    useLessonStore.getState().applyEvaluation(validation, progress, [], adaptiveHint);
  });
}

const MATCH = { lessonId: lesson.id, objectiveId: "commit", ruleId: "staged-not-committed" };

afterEach(() => {
  act(() => {
    useLessonStore.getState().startLesson();
  });
});

describe("LessonPanel adaptive hints", () => {
  it("offers the matching rule's ladder once the learner has acted", async () => {
    const onHintRevealed = vi.fn();
    render(
      <LessonPanel lesson={lesson} onPracticeAgain={vi.fn()} onHintRevealed={onHintRevealed} />,
    );
    evaluate(MATCH);
    // Like tips and "Not yet", nothing is offered before the learner has tried anything.
    expect(screen.queryByTestId("adaptive-hint")).not.toBeInTheDocument();

    act(() => {
      useLessonStore.getState().recordCommand();
    });
    expect(screen.getByTestId("adaptive-hint")).toHaveAttribute(
      "data-rule",
      "staged-not-committed",
    );
    expect(screen.queryByTestId("hint-missing")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show a hint based on your progress" }),
    );
    expect(screen.getByTestId("adaptive-hint-step")).toHaveTextContent(
      "README.md is staged; only the commit is missing.",
    );
    // Counted under the rule's id, apart from the objective's own hints.
    expect(onHintRevealed).toHaveBeenCalledWith("staged-not-committed", 0);
    expect(useLessonStore.getState().hintStates["staged-not-committed"]?.revealedHints).toBe(1);
    expect(useLessonStore.getState().hintStates.commit).toBeUndefined();
  });

  it("goes back to the validator's reason when the rule stops matching", () => {
    render(<LessonPanel lesson={lesson} onPracticeAgain={vi.fn()} />);
    act(() => {
      useLessonStore.getState().recordCommand();
    });
    evaluate(MATCH);
    expect(screen.getByTestId("adaptive-hint")).toBeInTheDocument();
    evaluate(null);
    expect(screen.queryByTestId("adaptive-hint")).not.toBeInTheDocument();
    expect(screen.getByTestId("hint-missing")).toHaveTextContent("There are no commits yet.");
  });

  it("ignores a recommendation for another objective or lesson", () => {
    render(<LessonPanel lesson={lesson} onPracticeAgain={vi.fn()} />);
    act(() => {
      useLessonStore.getState().recordCommand();
    });
    evaluate({ ...MATCH, objectiveId: "stage" });
    expect(screen.queryByTestId("adaptive-hint")).not.toBeInTheDocument();
    evaluate({ ...MATCH, lessonId: "another-lesson" });
    expect(screen.queryByTestId("adaptive-hint")).not.toBeInTheDocument();
  });

  it("clears the suggestion and its progress on reset", async () => {
    render(<LessonPanel lesson={lesson} onPracticeAgain={vi.fn()} />);
    act(() => {
      useLessonStore.getState().recordCommand();
    });
    evaluate(MATCH);
    await userEvent.click(
      screen.getByRole("button", { name: "Show a hint based on your progress" }),
    );
    act(() => {
      useLessonStore.getState().resetAttempt();
    });
    expect(useLessonStore.getState().adaptiveHint).toBeNull();
    expect(useLessonStore.getState().hintStates).toEqual({});
    expect(screen.queryByTestId("adaptive-hint")).not.toBeInTheDocument();
  });
});
