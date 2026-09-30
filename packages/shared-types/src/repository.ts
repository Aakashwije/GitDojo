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

/** A path left conflicted by a merge. File contents are `undefined` where that side lacks the file. */
export interface ConflictState {
  path: string;
  /** The current branch's version (HEAD). */
  ours?: string;
  /** The incoming branch's version. */
  theirs?: string;
  /** The version both sides started from (the merge base). */
  base?: string;
  /** True once the learner has edited out the markers and staged the file with `git add`. */
  resolved: boolean;
}

/** A merge that stopped for conflicts and has not been committed or aborted yet. */
export interface MergeState {
  /** The branch being merged in, as the learner typed it. */
  branch: string;
  /** Its commit (MERGE_HEAD). */
  oid: string;
}

export interface RepositoryState {
  initialized: boolean;
  currentBranch: string | null;
  head: string | null;
  branches: BranchState[];
  /** Commits reachable from HEAD, newest first. This is what `git log` shows. */
  commits: CommitState[];
  /**
   * Commits reachable from HEAD or any branch, children before parents (newest first). The graph
   * needs these: after switching away from a branch its commits are no longer in `commits`.
   */
  allCommits: CommitState[];
  /** Working tree view: one entry per path present in (or deleted from) the working directory. */
  files: FileState[];
  /** Index view: one entry per path whose staged content differs from HEAD. */
  stagedFiles: FileState[];
  /** Conflicts of the merge in progress; empty when no merge is in progress. */
  conflicts: ConflictState[];
  merge: MergeState | null;
}

export const EMPTY_REPOSITORY_STATE: RepositoryState = {
  initialized: false,
  currentBranch: null,
  head: null,
  branches: [],
  commits: [],
  allCommits: [],
  files: [],
  stagedFiles: [],
  conflicts: [],
  merge: null,
};
