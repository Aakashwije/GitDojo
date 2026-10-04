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

/** Operations that can stop for conflicts, to be continued or aborted. */
export type OperationKind = "merge" | "revert" | "cherry-pick" | "rebase";

/**
 * An operation that stopped for conflicts and has not been finished or aborted yet: a merge, or a
 * revert, cherry-pick or rebase step.
 */
export interface MergeState {
  kind: OperationKind;
  /** Merges: the branch being merged in, as typed. Otherwise the commit, `abc1234 (subject)`. */
  branch: string;
  /** The incoming commit (MERGE_HEAD, CHERRY_PICK_HEAD, ...). */
  oid: string;
  /** Rebases: the branch being rebased, its new base, and commits left after this one. */
  rebase?: { branch: string; onto: string; remaining: number };
}

/** One `git stash` entry, newest first. */
export interface StashState {
  /** `stash@{n}` */
  selector: string;
  /** `WIP on main: abc1234 Subject` or `On main: <message>` */
  message: string;
  branch: string | null;
  oid: string;
  /** Files the entry holds changes for. */
  files: string[];
}

/** One HEAD movement recorded in the reflog, newest first. */
export interface ReflogEntryState {
  /** `HEAD@{n}` */
  selector: string;
  oid: string;
  shortOid: string;
  /** e.g. `commit: Add login`, `checkout: moving from main to feature`, `reset: moving to HEAD~1`. */
  message: string;
  /** Seconds since the Unix epoch. */
  timestamp: number;
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
  /** Conflicts of the operation in progress; empty when nothing is in progress. */
  conflicts: ConflictState[];
  /** The merge, revert, cherry-pick or rebase stopped for conflicts, if any. */
  merge: MergeState | null;
  /** `git stash list`, newest first. */
  stashes: StashState[];
  /** Where HEAD has been, newest first (what `git reflog` shows). */
  reflog: ReflogEntryState[];
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
  stashes: [],
  reflog: [],
};
