// @vitest-environment node
import "fake-indexeddb/auto";

import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type LessonDefinition, type RepositoryState } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { settleEditor } from "./git-editor";
import { LearningSession } from "./learning-session";
import { PracticeSession, workspaceIdForPractice } from "./practice-session";

let counter = 0;
function environment(): LessonEnvironment {
  counter += 1;
  const fs = createLightningFs(`practice-session-test-${String(counter)}`, { wipe: true });
  const gitFor = (workspaceId: string) => createGitEngine({ fs, workspaceId });
  return {
    files: new WorkspaceFileSystem(fs),
    gitFor,
    stateReader: createRepositoryStateReader(gitFor),
  };
}

/** Two checks that must hold together: a branch exists, and HEAD is back on main. */
const task: LessonDefinition = {
  id: "start-a-branch",
  slug: "start-a-branch",
  title: "Start a Branch",
  type: "challenge",
  difficulty: "beginner",
  concepts: ["branches"],
  setup: {
    initializeGit: true,
    commits: [{ message: "Initial commit", files: { "README.md": "# Hi\n" } }],
  },
  objectives: [
    { id: "check-1", description: "Check 1", validator: { type: "branch_exists", branch: "x" } },
    {
      id: "check-2",
      description: "Check 2",
      validator: { type: "current_branch", branch: "main" },
    },
  ],
};

describe("PracticeSession", () => {
  it("is solved only while every check holds at once, never stickily", async () => {
    const session = new PracticeSession(task, environment());
    expect(session.workspaceId).toBe(workspaceIdForPractice("start-a-branch"));
    expect((await session.start()).solved).toBe(false);

    // On the new branch: the branch exists, but HEAD is not on main any more.
    const switched = await session.execute("git switch -c x");
    expect(switched.snapshot.solved).toBe(false);
    expect(switched.snapshot.validation.passedCount).toBe(1);

    const back = await session.execute("git switch main");
    expect(back.snapshot.solved).toBe(true);

    // Unlike lesson progress, undoing the end state un-solves the task.
    const deleted = await session.execute("git branch -D x");
    expect(deleted.snapshot.solved).toBe(false);
  });

  it("starts over from the task's setup", async () => {
    const session = new PracticeSession(task, environment());
    await session.start();
    await session.execute("git branch x");
    expect((await session.reset()).repository.branches.map((branch) => branch.name)).toEqual([
      "main",
    ]);
  });
});

describe("settleEditor", () => {
  const rebaseLesson: LessonDefinition = {
    ...task,
    id: "tidy",
    slug: "tidy",
    setup: {
      initializeGit: true,
      commits: [
        { message: "Initial commit", files: { "a.txt": "a\n" } },
        { message: "Add b", files: { "b.txt": "b\n" } },
        { message: "wip", files: { "c.txt": "c\n" } },
      ],
    },
    objectives: [
      {
        id: "o",
        description: "o",
        validator: { type: "branch_contains_commit", branch: "main", message: "Add c" },
      },
    ],
  };
  const repositoryOf = (snapshot: { repository: RepositoryState }) => snapshot.repository;

  it("asks for each file Git opens and returns the whole command's output", async () => {
    const session = new LearningSession(rebaseLesson, environment());
    await session.start();
    const asked: string[] = [];
    const published: number[] = [];
    const outcome = await settleEditor(
      session,
      await session.execute("git rebase -i HEAD~2"),
      repositoryOf,
      (editor) => {
        asked.push(editor.file);
        return Promise.resolve(
          editor.purpose === "todo"
            ? {
                action: "save",
                content: editor.content.replace(/^pick (\S+) wip$/m, "reword $1 wip"),
              }
            : { action: "save", content: "Add c\n" },
        );
      },
      () => published.push(1),
    );
    expect(asked).toEqual(["git-rebase-todo", "COMMIT_EDITMSG"]);
    expect(published).toHaveLength(2);
    expect(outcome.result).toMatchObject({ ok: true, gitCommand: "rebase" });
    expect(outcome.result.output).toBe(
      [
        "hint: Waiting for your editor to close the file...",
        "hint: Waiting for your editor to close the file...",
        "Successfully rebased and updated refs/heads/main.",
      ].join("\n"),
    );
    expect(outcome.snapshot.progress.completed).toBe(true);
    expect(outcome.snapshot.repository.editor).toBeNull();
  });

  it("aborts the rebase when the learner closes the editor without saving", async () => {
    const session = new LearningSession(rebaseLesson, environment());
    const start = await session.start();
    const outcome = await settleEditor(
      session,
      await session.execute("git rebase -i HEAD~2"),
      repositoryOf,
      () => Promise.resolve({ action: "abort" }),
      () => undefined,
    );
    expect(outcome.result.ok).toBe(true);
    expect(outcome.snapshot.repository.head).toBe(start.repository.head);
    expect(outcome.snapshot.repository.editor).toBeNull();
  });

  it("asks again after an invalid todo list, showing why", async () => {
    const session = new LearningSession(rebaseLesson, environment());
    await session.start();
    const errors: (string | undefined)[] = [];
    let attempts = 0;
    await settleEditor(
      session,
      await session.execute("git rebase -i HEAD~2"),
      repositoryOf,
      (editor) => {
        errors.push(editor.error);
        attempts += 1;
        return Promise.resolve(
          attempts === 1 ? { action: "save", content: "frobnicate x\n" } : { action: "abort" },
        );
      },
      () => undefined,
    );
    expect(errors[0]).toBeUndefined();
    expect(errors[1]).toContain("invalid line 1");
  });

  it("returns ordinary commands untouched", async () => {
    const session = new LearningSession(rebaseLesson, environment());
    await session.start();
    const started = await session.execute("git status");
    const outcome = await settleEditor(
      session,
      started,
      repositoryOf,
      () => {
        throw new Error("no editor expected");
      },
      () => undefined,
    );
    expect(outcome.result).toEqual(started.result);
  });
});
