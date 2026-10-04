import { runCommandLine } from "@gitdojo/command-parser";
import { DEFAULT_BRANCH, type GitEngineFactory, type VirtualFileSystem } from "@gitdojo/git-engine";
import { type RepositoryStateReader } from "@gitdojo/repository-state";
import {
  type GitCommandResult,
  type LessonDefinition,
  type LessonSetup,
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
export function setupLesson(
  lesson: LessonDefinition,
  workspaceId: string,
  env: LessonEnvironment,
): Promise<RepositoryState> {
  return applySetup(lesson.setup, workspaceId, env, lesson.id);
}

/**
 * Builds a starting state (a lesson's, a challenge's or a playground scenario's) in an emptied
 * workspace: directories, `git init`, commits branch by branch, extra branches, the current
 * branch, uncommitted files, and finally setup commands.
 */
export async function applySetup(
  setup: LessonSetup,
  workspaceId: string,
  env: LessonEnvironment,
  /** Names the content in error messages. */
  origin: string,
): Promise<RepositoryState> {
  await env.files.createWorkspace(workspaceId);
  await env.files.resetWorkspace(workspaceId);

  const git = env.gitFor(workspaceId);
  const check = (result: GitCommandResult) => {
    if (!result.ok) throw new LessonSetupError(origin, result.output);
  };

  for (const directory of setup.directories ?? []) {
    await env.files.createDirectory(workspaceId, directory);
  }
  if (setup.initializeGit) check(await git.init());

  // Commits run in order; each goes on its branch (default main). A new branch starts at main's
  // tip at that point, so the list reads like a story of how the history was built.
  const commits = setup.commits ?? [];
  const now = Math.floor(Date.now() / 1000);
  let onBranch = DEFAULT_BRANCH;
  const moveTo = async (branch: string) => {
    if (branch === onBranch) return;
    const exists = (await git.listBranches()).some((info) => info.name === branch && info.oid);
    if (!exists && onBranch !== DEFAULT_BRANCH) check(await git.switchBranch(DEFAULT_BRANCH));
    check(exists ? await git.switchBranch(branch) : await git.createAndSwitchBranch(branch));
    onBranch = branch;
  };
  for (const [index, commit] of commits.entries()) {
    await moveTo(commit.branch ?? DEFAULT_BRANCH);
    for (const [path, content] of Object.entries(commit.files)) {
      if (content === null) await env.files.removeFile(workspaceId, path);
      else await env.files.writeFile(workspaceId, path, content);
    }
    check(await git.add(Object.keys(commit.files)));
    // Back-date the history a minute per commit so it reads naturally in `git log`.
    const timestamp = now - (commits.length - index) * 60;
    check(await git.commit({ message: commit.message, timestamp }));
  }
  if (commits.length > 0) await moveTo(DEFAULT_BRANCH);
  for (const branch of setup.branches ?? []) check(await git.createBranch(branch));
  if (setup.currentBranch !== undefined) await moveTo(setup.currentBranch);

  // Written after the history, so with setup commits these are the learner's uncommitted changes.
  for (const [path, content] of Object.entries(setup.files ?? {})) {
    await env.files.writeFile(workspaceId, path, content);
  }

  // Last, through the real parser and router, so a setup command behaves exactly like a typed
  // one and can act on the files above (`git add notes.md`, `git stash`).
  for (const command of setup.commands ?? []) {
    const result = await runCommandLine(command, { workspaceId, git });
    if (!result.ok) throw new LessonSetupError(origin, `\`${command}\` failed: ${result.output}`);
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
