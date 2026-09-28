import {
  type BranchState,
  type GitAuthor,
  type GitCommandResult,
  type StagedChange,
} from "@gitdojo/shared-types";

export const DEFAULT_BRANCH = "main";

export const DEFAULT_AUTHOR: GitAuthor = {
  name: "GitDojo Learner",
  email: "learner@gitdojo.local",
};

export type UnstagedChange = "modified" | "deleted" | "untracked";

/** One path as seen by HEAD, the index and the working directory. */
export interface GitStatusEntry {
  path: string;
  inHead: boolean;
  inIndex: boolean;
  inWorkdir: boolean;
  /** Difference between HEAD and the index. */
  staged: StagedChange | null;
  /** Difference between the index and the working directory. */
  unstaged: UnstagedChange | null;
}

export interface GitInitData {
  reinitialized: boolean;
  defaultBranch: string;
}

export interface GitStatusData {
  branch: string | null;
  hasCommits: boolean;
  entries: GitStatusEntry[];
}

export interface GitAddData {
  /** Paths whose working-tree content was written to the index. */
  staged: string[];
  /** Paths removed from the index because they were deleted from the working tree. */
  removed: string[];
}

export interface GitCommitData {
  oid: string;
  shortOid: string;
  branch: string | null;
  rootCommit: boolean;
  filesChanged: number;
}

export interface GitCommitInfo {
  oid: string;
  shortOid: string;
  message: string;
  author: GitAuthor & {
    /** Seconds since the Unix epoch. */
    timestamp: number;
    /** Minutes, using the same sign convention as `Date#getTimezoneOffset`. */
    timezoneOffset: number;
  };
  parents: string[];
}

export interface GitLogData {
  commits: GitCommitInfo[];
}

export interface GitLogOptions {
  oneline?: boolean;
}

export interface GitCommitInput {
  message: string;
  author?: GitAuthor;
  /** Seconds since the Unix epoch. Defaults to now; lesson setup back-dates its commits. */
  timestamp?: number;
}

export interface GitBranchInfo {
  name: string;
  oid: string | null;
}

export interface GitBranchListData {
  /** Sorted by name, like `git branch`. Includes the current branch even before its first commit. */
  branches: BranchState[];
}

export interface GitBranchCreateData {
  name: string;
  oid: string;
}

export interface GitSwitchData {
  branch: string;
  /** False when the learner was already on the branch. */
  switched: boolean;
  created: boolean;
  /** Working-tree paths written or removed to match the target branch. */
  updatedPaths: string[];
}

/** Read-only view of everything the repository-state package needs, in engine-neutral shapes. */
export interface GitRepositorySnapshot {
  initialized: boolean;
  currentBranch: string | null;
  head: string | null;
  branches: GitBranchInfo[];
  /** Commits reachable from HEAD, newest first. */
  commits: GitCommitInfo[];
  /** Commits reachable from HEAD or any branch, children before parents. */
  allCommits: GitCommitInfo[];
  entries: GitStatusEntry[];
}

export type GitInitResult = GitCommandResult<GitInitData>;
export type GitStatusResult = GitCommandResult<GitStatusData>;
export type GitAddResult = GitCommandResult<GitAddData>;
export type GitCommitResult = GitCommandResult<GitCommitData>;
export type GitLogResult = GitCommandResult<GitLogData>;
export type GitBranchListResult = GitCommandResult<GitBranchListData>;
export type GitBranchCreateResult = GitCommandResult<GitBranchCreateData>;
export type GitSwitchResult = GitCommandResult<GitSwitchData>;

/**
 * The only entry point to Git for the rest of GitDojo. Implementations are bound to one workspace.
 * Command methods never reject: failures come back as `{ ok: false, error }` with Git-like output.
 */
export interface GitEngine {
  readonly workspaceId: string;
  init(): Promise<GitInitResult>;
  status(): Promise<GitStatusResult>;
  add(paths: string[]): Promise<GitAddResult>;
  commit(input: GitCommitInput): Promise<GitCommitResult>;
  log(options?: GitLogOptions): Promise<GitLogResult>;
  /** `git branch`: prints the branch list, marking the current branch with `*`. */
  showBranches(): Promise<GitBranchListResult>;
  /** `git branch <name>`: creates a branch at HEAD without switching to it. */
  createBranch(name: string): Promise<GitBranchCreateResult>;
  /** `git switch <name>`: moves HEAD to an existing branch and updates the working tree. */
  switchBranch(name: string): Promise<GitSwitchResult>;
  /** `git switch -c <name>`: creates a branch at HEAD and switches to it. */
  createAndSwitchBranch(name: string): Promise<GitSwitchResult>;
  /** Branches as data (no output). Empty outside a repository. Rejects only on internal failures. */
  listBranches(): Promise<BranchState[]>;
  /** Reads repository state without mutating it. Rejects only on unexpected internal failures. */
  snapshot(): Promise<GitRepositorySnapshot>;
}

export type GitEngineFactory = (workspaceId: string) => GitEngine;
