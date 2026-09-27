import {
  createGitEngine,
  createLightningFs,
  WorkspaceFileSystem,
  type GitEngineFactory,
} from "@gitdojo/git-engine";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { createRepositoryStateReader } from "@gitdojo/repository-state";

/** Wires the IndexedDB-backed filesystem, Git engine and state reader. Browser only. */
export function createBrowserLessonEnvironment(): LessonEnvironment {
  const fs = createLightningFs("gitdojo");
  const gitFor: GitEngineFactory = (workspaceId) => createGitEngine({ fs, workspaceId });
  return {
    files: new WorkspaceFileSystem(fs),
    gitFor,
    stateReader: createRepositoryStateReader(gitFor),
  };
}
