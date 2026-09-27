import { type GitEngineFactory, type VirtualFileSystem } from "@gitdojo/git-engine";
import { type RepositoryStateReader } from "@gitdojo/repository-state";
import { type LessonDefinition, type RepositoryState } from "@gitdojo/shared-types";
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

  for (const directory of lesson.setup.directories ?? []) {
    await env.files.createDirectory(workspaceId, directory);
  }
  for (const [path, content] of Object.entries(lesson.setup.files ?? {})) {
    await env.files.writeFile(workspaceId, path, content);
  }

  if (lesson.setup.initializeGit) {
    const result = await env.gitFor(workspaceId).init();
    if (!result.ok) throw new LessonSetupError(lesson.id, result.output);
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
