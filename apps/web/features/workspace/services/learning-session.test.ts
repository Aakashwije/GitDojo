// @vitest-environment node
import "fake-indexeddb/auto";

import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { LearningSession } from "./learning-session";

let counter = 0;
function environment(): LessonEnvironment {
  counter += 1;
  const fs = createLightningFs(`session-test-${String(counter)}`, { wipe: true });
  const gitFor = (workspaceId: string) => createGitEngine({ fs, workspaceId });
  return {
    files: new WorkspaceFileSystem(fs),
    gitFor,
    stateReader: createRepositoryStateReader(gitFor),
  };
}

const lesson: LessonDefinition = {
  id: "first-commit",
  slug: "first-commit",
  title: "Your First Commit",
  difficulty: "beginner",
  concepts: [],
  setup: { files: { "README.md": "# GitDojo\n" } },
  objectives: [
    { id: "initialize", description: "Init", validator: { type: "repository_initialized" } },
    {
      id: "stage-readme",
      description: "Stage",
      validator: { type: "file_staged", file: "README.md" },
    },
    { id: "first-commit", description: "Commit", validator: { type: "commit_exists" } },
  ],
};

describe("LearningSession", () => {
  it("runs the first-commit flow and completes the lesson", async () => {
    const session = new LearningSession(lesson, environment());
    const initial = await session.start();
    expect(initial.repository.initialized).toBe(false);
    expect(initial.progress.currentObjectiveId).toBe("initialize");

    const status = await session.execute("git status");
    expect(status.result.errorCode).toBe("NOT_A_REPOSITORY");

    await session.execute("git init");
    const add = await session.execute("git add README.md");
    expect(add.snapshot.repository.stagedFiles.map((file) => file.path)).toEqual(["README.md"]);

    const commit = await session.execute('git commit -m "Initial commit"');
    expect(commit.snapshot.repository.commits).toHaveLength(1);
    // README.md is no longer staged, yet the objective stays achieved.
    expect(
      commit.snapshot.validation.objectives.find((o) => o.objectiveId === "stage-readme")?.passed,
    ).toBe(false);
    expect(commit.snapshot.progress.completed).toBe(true);
  });

  it("returns the latest snapshot when start() is called again", async () => {
    const session = new LearningSession(lesson, environment());
    await session.start();
    await session.execute("git init");
    const again = await session.start();
    expect(again.repository.initialized).toBe(true);
    expect(again.progress.completedObjectiveIds).toEqual(["initialize"]);
  });

  it("reset restores the starting state and clears progress", async () => {
    const session = new LearningSession(lesson, environment());
    const initial = await session.start();
    await session.execute("git init");
    await session.execute("git add .");
    const reset = await session.reset();
    expect(reset.repository).toEqual(initial.repository);
    expect(reset.progress.completedObjectiveIds).toEqual([]);
  });
});
