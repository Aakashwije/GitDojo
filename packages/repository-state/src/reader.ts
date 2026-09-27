import { type GitEngineFactory } from "@gitdojo/git-engine";
import { type RepositoryState } from "@gitdojo/shared-types";
import { toRepositoryState } from "./map-snapshot";

export interface RepositoryStateReader {
  read(workspaceId: string): Promise<RepositoryState>;
}

/** Builds the single state reader used after every command. */
export function createRepositoryStateReader(gitFor: GitEngineFactory): RepositoryStateReader {
  return {
    async read(workspaceId) {
      return toRepositoryState(await gitFor(workspaceId).snapshot());
    },
  };
}
