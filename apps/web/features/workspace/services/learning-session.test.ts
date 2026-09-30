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

  it("resolves a merge conflict through file edits and re-evaluates after saving", async () => {
    const conflictLesson: LessonDefinition = {
      id: "conflict",
      slug: "conflict",
      title: "Conflict",
      difficulty: "beginner",
      concepts: [],
      setup: {
        initializeGit: true,
        commits: [
          { message: "Base", files: { "a.txt": "base\n" } },
          { message: "Theirs", branch: "feature", files: { "a.txt": "theirs\n" } },
          { message: "Ours", files: { "a.txt": "ours\n" } },
        ],
      },
      objectives: [
        { id: "conflict", description: "c", validator: { type: "conflict_exists" } },
        {
          id: "resolved",
          description: "r",
          validator: { type: "conflict_resolved", file: "a.txt" },
        },
        { id: "done", description: "d", validator: { type: "merge_completed" } },
      ],
    };
    const session = new LearningSession(conflictLesson, environment());
    await session.start();
    const merge = await session.execute("git merge feature");
    expect(merge.result.errorCode).toBe("MERGE_CONFLICT");
    expect(merge.snapshot.repository.files).toEqual([{ path: "a.txt", status: "conflicted" }]);
    expect(await session.readFile("a.txt")).toContain("<<<<<<< HEAD");

    const saved = await session.writeFile("a.txt", "ours and theirs\n");
    expect(saved.repository.conflicts[0]?.resolved).toBe(false);
    await session.execute("git add a.txt");
    const done = await session.execute("git commit");
    expect(done.result.ok).toBe(true);
    expect(done.snapshot.progress.completed).toBe(true);
  });
});
