import {
  createGitEngine,
  createLightningFs,
  WorkspaceFileSystem,
  type GitEngineFactory,
} from "@gitdojo/git-engine";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type LessonEnvironment } from "./setup";

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
