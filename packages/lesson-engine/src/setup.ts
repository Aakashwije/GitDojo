import { type GitEngineFactory, type VirtualFileSystem } from "@gitdojo/git-engine";
import { type RepositoryStateReader } from "@gitdojo/repository-state";
import {
  type GitCommandResult,
  type LessonDefinition,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { LessonSetupError } from "./errors";

export interface LessonEnvironment {
  files: VirtualFileSystem;
  gitFor: GitEngineFactory;
  stateReader: RepositoryStateReader;
}

/**
 * Puts a workspace into the lesson's starting state and returns the resulting repository state.
 * Always starts from an empty workspace, so running it again restores the exact original state.
 */
export async function setupLesson(
  lesson: LessonDefinition,
  workspaceId: string,
  env: LessonEnvironment,
): Promise<RepositoryState> {
  await env.files.createWorkspace(workspaceId);
  await env.files.resetWorkspace(workspaceId);

  const { setup } = lesson;
  const git = env.gitFor(workspaceId);
  const check = (result: GitCommandResult) => {
    if (!result.ok) throw new LessonSetupError(lesson.id, result.output);
  };

  for (const directory of setup.directories ?? []) {
    await env.files.createDirectory(workspaceId, directory);
  }
  if (setup.initializeGit) check(await git.init());

  const commits = setup.commits ?? [];
  const now = Math.floor(Date.now() / 1000);
  for (const [index, commit] of commits.entries()) {
    for (const [path, content] of Object.entries(commit.files)) {
      await env.files.writeFile(workspaceId, path, content);
    }
    check(await git.add(Object.keys(commit.files)));
    // Back-date the history a minute per commit so it reads naturally in `git log`.
    const timestamp = now - (commits.length - index) * 60;
    check(await git.commit({ message: commit.message, timestamp }));
  }
  for (const branch of setup.branches ?? []) check(await git.createBranch(branch));

  // Written last, so with setup commits these are the learner's uncommitted changes.
  for (const [path, content] of Object.entries(setup.files ?? {})) {
    await env.files.writeFile(workspaceId, path, content);
  }

  return env.stateReader.read(workspaceId);
}

/** Restores a lesson's workspace to its original state, discarding all learner changes. */
export function resetLesson(
  lesson: LessonDefinition,
  workspaceId: string,
  env: LessonEnvironment,
): Promise<RepositoryState> {
  return setupLesson(lesson, workspaceId, env);
}
