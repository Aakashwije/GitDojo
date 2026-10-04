import { runCommandLine } from "@gitdojo/command-parser";
import {
  createGitEngine,
  createLightningFs,
  WorkspaceFileSystem,
  type GitEngineFactory,
} from "@gitdojo/git-engine";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { validateLesson } from "@gitdojo/validator";
import { advanceProgress, createInitialProgress, type LessonProgress } from "./progress";
import { setupLesson, type LessonEnvironment } from "./setup";

let dbCounter = 0;

export function createTestEnvironment(): LessonEnvironment {
  dbCounter += 1;
  const fs = createLightningFs(`lesson-test-${String(dbCounter)}`, { wipe: true });
  const gitFor: GitEngineFactory = (workspaceId) => createGitEngine({ fs, workspaceId });
  return {
    files: new WorkspaceFileSystem(fs),
    gitFor,
    stateReader: createRepositoryStateReader(gitFor),
  };
}

/** A command typed in the terminal, or a file edited in the UI (e.g. resolving a conflict). */
export type PlayStep = string | { write: string; content: string } | { delete: string };

/** Error codes that are the expected outcome of a step, not a broken solution. */
const EXPECTED_FAILURES = new Set(["MERGE_CONFLICT"]);

export interface PlayResult {
  /** Progress before any step: content must never start with objectives done. */
  initial: LessonProgress;
  progress: LessonProgress;
}

/**
 * Plays steps through the real parser, Git engine and validators, exactly like a learner's
 * session. Throws when a command fails unexpectedly, naming the step.
 */
export async function play(lesson: LessonDefinition, steps: PlayStep[]): Promise<PlayResult> {
  const env = createTestEnvironment();
  const workspaceId = `play-${lesson.id}`;
  let repository = await setupLesson(lesson, workspaceId, env);
  const initial = advanceProgress(
    lesson,
    createInitialProgress(lesson),
    await validateLesson(lesson, { repository }),
  );
  let progress = initial;

  for (const step of steps) {
    if (typeof step !== "string") {
      if ("write" in step) await env.files.writeFile(workspaceId, step.write, step.content);
      else await env.files.removeFile(workspaceId, step.delete);
    } else {
      const result = await runCommandLine(step, { workspaceId, git: env.gitFor(workspaceId) });
      if (!result.ok && !EXPECTED_FAILURES.has(result.errorCode ?? "")) {
        throw new Error(`${lesson.id}: \`${step}\` failed:\n${result.output}`);
      }
    }
    repository = await env.stateReader.read(workspaceId);
    progress = advanceProgress(lesson, progress, await validateLesson(lesson, { repository }));
  }
  return { initial, progress };
}
