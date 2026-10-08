import "fake-indexeddb/auto";

import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import {
  createMemoryStorage,
  ProgressRepository,
  type ProgressCatalog,
  type ProgressStorage,
} from "@gitdojo/progress";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLessonStore } from "@/features/lesson";
import { useLearningSession } from "@/features/workspace";
import { ProgressStatusNotice } from "./components/ProgressProvider";
import { useLessonProgress } from "./hooks/use-lesson-progress";
import {
  initProgress,
  resetProgressStoreForTests,
  useProgressStore,
} from "./state/use-progress-store";

// The whole loop: terminal input → parser → Git engine → repository state → validators →
// completion → progress.

let counter = 0;
function environment(): LessonEnvironment {
  counter += 1;
  const fs = createLightningFs(`progress-flow-${String(counter)}`, { wipe: true });
  const gitFor = (workspaceId: string) => createGitEngine({ fs, workspaceId });
  return {
    files: new WorkspaceFileSystem(fs),
    gitFor,
    stateReader: createRepositoryStateReader(gitFor),
  };
}

const LESSON: LessonDefinition = {
  id: "first-commit",
  slug: "first-commit",
  title: "Your First Commit",
  difficulty: "beginner",
  concepts: [],
  setup: { files: { "README.md": "# GitDojo\n" } },
  objectives: [
    { id: "initialize", description: "Init", validator: { type: "repository_initialized" } },
    { id: "stage", description: "Stage", validator: { type: "file_staged", file: "README.md" } },
    { id: "commit", description: "Commit", validator: { type: "commit_exists" } },
  ],
};

const CATALOG: ProgressCatalog = {
  courses: [],
  lessons: [{ id: "first-commit", title: "Your First Commit", type: "interactive" }],
  challenges: [{ id: "first-commit", title: "First Commit" }],
};

function useLessonFlow(options: { challenge?: boolean; courseId?: string } = {}) {
  const session = useLearningSession(LESSON, {
    createEnvironment: environment,
    ...(options.challenge ? { workspaceId: "challenge-first-commit" } : {}),
  });
  const evaluated = useLessonStore(
    (state) => state.progress?.lessonId === LESSON.id && state.progress.completed,
  );
  // As in LessonWorkspace: only this session's own evaluation counts.
  const completed = session.status === "ready" && evaluated;
  useLessonProgress({
    lesson: LESSON,
    challenge: options.challenge ?? false,
    completed,
    ...(options.courseId ? { courseId: options.courseId } : {}),
  });
  return session;
}

async function start(storage: ProgressStorage = createMemoryStorage()) {
  await initProgress(CATALOG, (catalog) => new ProgressRepository({ storage, catalog }));
}

async function renderFlow(options: { challenge?: boolean; courseId?: string } = {}) {
  const view = renderHook(() => useLessonFlow(options));
  await waitFor(() => {
    expect(view.result.current.status).toBe("ready");
  });
  const run = async (...lines: string[]) => {
    for (const line of lines) {
      await act(async () => {
        await view.result.current.execute(line);
      });
    }
  };
  return { ...view, run };
}

const progress = () => useProgressStore.getState().progress;

async function settled() {
  await waitFor(() => {
    expect(useProgressStore.getState().saving).toBe(false);
  });
}

beforeEach(() => {
  resetProgressStoreForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lesson activity reaches progress", () => {
  it("counts submitted Git commands by outcome, and awards completion XP once", async () => {
    await start();
    const { run, result } = await renderFlow();

    await run("git status", "help", "clear", "ls", "git init", "git add README.md");
    await run('git commit -m "Initial commit"');
    await settled();
    expect(progress()?.completedLessons["first-commit"]).toMatchObject({
      xp: 50,
      type: "interactive",
    });
    expect(progress()?.commandStats).toMatchObject({
      status: { uses: 1, successes: 0 },
      init: { uses: 1, successes: 1 },
      add: { uses: 1, successes: 1 },
      commit: { uses: 1, successes: 1 },
    });
    // help, clear and ls are not Git commands.
    expect(Object.keys(progress()?.commandStats ?? {})).toHaveLength(4);
    expect(useProgressStore.getState().lastAward).toEqual({ key: "lesson:first-commit", xp: 50 });

    // Practice again: a full replay earns nothing new.
    await act(async () => {
      await result.current.reset();
    });
    await run("git init", "git add README.md", 'git commit -m "Again"');
    await settled();
    expect(progress()?.xp).toBe(50);
    expect(progress()?.commandStats.commit).toMatchObject({ uses: 2, successes: 2 });
    expect(useProgressStore.getState().lastAward).toEqual({ key: "lesson:first-commit", xp: 0 });
  });

  it("does not carry a finished lesson's completion over to a challenge with the same id", async () => {
    await start();
    const lesson = await renderFlow();
    await lesson.run("git init", "git add README.md", 'git commit -m "Initial commit"');
    await settled();
    lesson.unmount();

    // The demo lesson and the standalone challenge are both `first-commit`.
    await renderFlow({ challenge: true });
    await settled();
    expect(progress()?.completedChallenges).toEqual({});
    expect(progress()?.xp).toBe(50);
  });

  it("records a standalone challenge as a challenge, not a lesson", async () => {
    await start();
    const { run } = await renderFlow({ challenge: true });
    await run("git init", "git add .", 'git commit -m "Initial commit"');
    await settled();
    expect(progress()?.completedChallenges["first-commit"]).toMatchObject({ xp: 100 });
    expect(progress()?.completedLessons).toEqual({});
  });

  it("does not complete until the repository state is right", async () => {
    await start();
    const { run } = await renderFlow();
    // Commands that mention the right things but leave nothing committed.
    await run("git init", "git add nothing.txt", "git commit");
    await settled();
    expect(progress()?.completedLessons).toEqual({});
    expect(progress()?.commandStats.commit).toMatchObject({ uses: 1, successes: 0 });
  });

  it("remembers the last course lesson and restores everything after a reload", async () => {
    const storage = createMemoryStorage();
    await start(storage);
    const { run, unmount } = await renderFlow({ courseId: "git-basics" });
    await run("git init", "git add README.md", 'git commit -m "Initial commit"');
    await settled();
    unmount();

    // A reload: a fresh store reading the same storage.
    resetProgressStoreForTests();
    await start(storage);
    expect(progress()).toMatchObject({
      xp: 50,
      lastLesson: { courseId: "git-basics", lessonId: "first-commit" },
      commandStats: { commit: { uses: 1 } },
    });
  });

  it("keeps learning working when saving fails, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const memory = createMemoryStorage();
    let broken = false;
    const storage: ProgressStorage = {
      ...memory,
      update: (key, change) =>
        broken ? Promise.reject(new Error("QuotaExceededError")) : memory.update(key, change),
    };
    await start(storage);
    render(<ProgressStatusNotice />);
    broken = true;

    const { run } = await renderFlow();
    await run("git init", "git add README.md", 'git commit -m "Initial commit"');
    await settled();
    // The lesson still completed, and the learner sees it in this tab...
    expect(useLessonStore.getState().progress?.completed).toBe(true);
    expect(progress()?.xp).toBe(50);
    // ...with a clear notice that it was not saved.
    expect(await screen.findByTestId("progress-status")).toHaveTextContent(
      "couldn't save your latest progress",
    );
  });
});
