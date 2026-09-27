/**
 * Normalized repository model consumed by the UI and the validator engine.
 * Nothing in here should mirror isomorphic-git's raw shapes.
 */

export type FileStatus =
  "untracked" | "modified" | "staged" | "committed" | "deleted" | "ignored" | "conflicted";

/** How a staged path differs from HEAD. */
export type StagedChange = "added" | "modified" | "deleted";

export interface FileState {
  path: string;
  status: FileStatus;
  /** Present on staged entries so the UI can say "new file" vs "modified". */
  change?: StagedChange;
}

export interface CommitState {
  oid: string;
  shortOid: string;
  message: string;
  authorName: string;
  authorEmail: string;
  /** Seconds since the Unix epoch, as recorded in the commit object. */
  timestamp: number;
  parents: string[];
}

export interface BranchState {
  name: string;
  /** `null` for an unborn branch (initialized repository without commits). */
  oid: string | null;
  current: boolean;
}

export interface ConflictState {
  path: string;
}

export interface RepositoryState {
  initialized: boolean;
  currentBranch: string | null;
  head: string | null;
  branches: BranchState[];
  /** Commits reachable from HEAD, newest first. */
  commits: CommitState[];
  /** Working tree view: one entry per path present in (or deleted from) the working directory. */
  files: FileState[];
  /** Index view: one entry per path whose staged content differs from HEAD. */
  stagedFiles: FileState[];
  conflicts: ConflictState[];
}

export const EMPTY_REPOSITORY_STATE: RepositoryState = {
  initialized: false,
  currentBranch: null,
  head: null,
  branches: [],
  commits: [],
  files: [],
  stagedFiles: [],
  conflicts: [],
};
