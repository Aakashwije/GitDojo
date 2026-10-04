import { EMPTY_REPOSITORY_STATE, type RepositoryState } from "@gitdojo/shared-types";
import { create } from "zustand";

interface RepositoryStore {
  workspaceId: string | null;
  repositoryState: RepositoryState;
  /** Bumped on every new state, so views can re-read files a command may have changed. */
  revision: number;
  selectedCommit: string | null;
  loading: boolean;
  error: string | null;
  setWorkspace: (workspaceId: string) => void;
  setRepositoryState: (state: RepositoryState) => void;
  selectCommit: (oid: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/** View state only. Repository state is computed by `@gitdojo/repository-state` and pushed here. */
export const useRepositoryStore = create<RepositoryStore>()((set) => ({
  workspaceId: null,
  repositoryState: EMPTY_REPOSITORY_STATE,
  revision: 0,
  selectedCommit: null,
  loading: true,
  error: null,
  setWorkspace: (workspaceId) => {
    set({
      workspaceId,
      repositoryState: EMPTY_REPOSITORY_STATE,
      selectedCommit: null,
      loading: true,
      error: null,
    });
  },
  setRepositoryState: (repositoryState) => {
    set((current) => ({
      repositoryState,
      revision: current.revision + 1,
      loading: false,
      error: null,
      // Drop a selection that no longer exists (e.g. after a lesson reset).
      selectedCommit: repositoryState.allCommits.some(
        (commit) => commit.oid === current.selectedCommit,
      )
        ? current.selectedCommit
        : null,
    }));
  },
  selectCommit: (selectedCommit) => {
    set({ selectedCommit });
  },
  setLoading: (loading) => {
    set({ loading });
  },
  setError: (error) => {
    set({ error, loading: false });
  },
}));
