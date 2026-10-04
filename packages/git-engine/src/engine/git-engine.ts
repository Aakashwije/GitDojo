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

export type ConflictKind = "both modified" | "both added" | "deleted by us" | "deleted by them";

/** Operations that can stop halfway for conflicts and be continued or aborted. */
export type GitOperationKind = "merge" | "revert" | "cherry-pick" | "rebase";

export interface GitStatusData {
  branch: string | null;
  /** HEAD's commit; with `branch: null` this is where HEAD is detached. */
  head: string | null;
  hasCommits: boolean;
  entries: GitStatusEntry[];
  /**
   * Set while an operation that stopped for conflicts (a merge, revert, cherry-pick or rebase
   * step) has not been finished or aborted.
   */
  merge: {
    kind: GitOperationKind;
    /** The commit being reverted, cherry-picked or replayed. */
    commit: string;
    unresolved: { path: string; kind: ConflictKind }[];
    /** Rebases: the branch being rebased and where to. */
    rebase?: { branch: string; onto: string };
  } | null;
}

export interface GitAddData {
  /** Paths whose working-tree content was written to the index. */
  staged: string[];
  /** Paths removed from the index because they were deleted from the working tree. */
  removed: string[];
  /** Conflicted paths this `git add` marked as resolved. */
  resolved: string[];
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
  /** Start from this revision instead of HEAD (`git log feature`). */
  revision?: string;
  /** `--all`: every branch's history, not just HEAD's. */
  all?: boolean;
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
  /** The branch HEAD is now attached to, or `null` when HEAD is detached. */
  branch: string | null;
  /** The commit HEAD now points to (`null` on an unborn branch). */
  oid: string | null;
  /** False when the learner was already there. */
  switched: boolean;
  created: boolean;
  /** Working-tree paths written or removed to match the target commit. */
  updatedPaths: string[];
  /** Commits left behind when leaving a detached HEAD: reachable from no branch any more. */
  orphaned: string[];
}

export interface GitBranchDeleteData {
  name: string;
  oid: string;
}

export interface GitDetachOptions {
  /** Print Git's long "You are in 'detached HEAD' state" advice, as `git checkout <commit>` does. */
  advice?: boolean;
}

export interface GitMergeOptions {
  /** `--no-ff`: record a merge commit even when a fast-forward is possible. */
  noFastForward?: boolean;
  /** `--ff-only`: refuse unless the merge is a fast-forward. */
  fastForwardOnly?: boolean;
}

export interface GitMergeData {
  type: "fast-forward" | "merge-commit" | "conflict" | "up-to-date";
  /** The commit the current branch now points to (not set for conflicts). */
  oid?: string;
  /** Paths left conflicted. */
  conflicts?: string[];
}

export interface GitAbortMergeData {
  restoredPaths: string[];
}

/** A conflicted path; contents are `null` where that side does not have the file. */
export interface GitConflictInfo {
  path: string;
  base: string | null;
  ours: string | null;
  theirs: string | null;
  resolved: boolean;
}

export interface GitMergeInfo {
  kind: GitOperationKind;
  /** Merges: the branch being merged in. Otherwise the commit being applied, `abc1234 (subject)`. */
  branch: string;
  theirs: string;
  conflicts: GitConflictInfo[];
  /** Rebases: the branch being rebased, where onto, and how many commits are left after this one. */
  rebase?: { branch: string; onto: string; remaining: number };
}

export interface GitDiffLine {
  type: "context" | "add" | "remove";
  text: string;
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitDiffLine[];
}

export interface GitFileDiff {
  path: string;
  change: "added" | "modified" | "deleted";
  hunks: GitDiffHunk[];
  insertions: number;
  deletions: number;
}

export interface GitDiffOptions {
  /** `--staged` / `--cached`: HEAD against the staging area instead of staging against files. */
  staged?: boolean;
  /** Pathspecs that limit the diff (default: everything). */
  paths?: string[];
}

export interface GitDiffData {
  files: GitFileDiff[];
}

export interface GitRestoreOptions {
  /** `--staged`: restore the staging area (from HEAD). */
  staged?: boolean;
  /** `--worktree`: restore working-tree files (the default unless `--staged` is given). */
  worktree?: boolean;
  /** `--source <tree-ish>`: take content from this commit instead of the index / HEAD. */
  source?: string;
}

export interface GitRestoreData {
  restored: string[];
}

export type GitResetMode = "soft" | "mixed" | "hard";

export interface GitResetOptions {
  mode?: GitResetMode;
  /** Defaults to HEAD. */
  commit?: string;
  /** `git reset [<commit>] -- <paths>`: unstage these paths instead of moving HEAD. */
  paths?: string[];
}

export interface GitResetData {
  mode: GitResetMode;
  /** HEAD before and after (equal for a path reset). */
  from: string | null;
  to: string | null;
  /** Paths whose staged state changed, for a path reset; tracked files left modified, otherwise. */
  paths: string[];
}

export interface GitPickData {
  /** The new commit, unless the operation stopped for conflicts. */
  oid?: string;
  conflicts?: string[];
}

export interface GitStashEntry {
  /** `n` in `stash@{n}`. */
  index: number;
  message: string;
  /** The branch the work was stashed from (`null` when HEAD was detached). */
  branch: string | null;
  oid: string;
  /** Paths the entry holds changes for. */
  paths: string[];
}

export interface GitStashPushOptions {
  message?: string;
  /** `-u`: stash untracked files too. */
  includeUntracked?: boolean;
}

export interface GitStashData {
  stashes: GitStashEntry[];
  /** For apply/pop: paths left with conflict markers. */
  conflicts?: string[];
}

export interface GitReflogData {
  entries: GitReflogEntry[];
}

export interface GitRebaseData {
  status: "up-to-date" | "fast-forward" | "rebased" | "conflict" | "aborted";
  /** The rebased branch's new tip (or the original one after `--abort`). */
  oid?: string;
  conflicts?: string[];
}

/** One reflog line for HEAD, newest first; `index` is the `n` in `HEAD@{n}`. */
export interface GitReflogEntry {
  index: number;
  oid: string;
  previousOid: string | null;
  message: string;
  /** Seconds since the Unix epoch. */
  timestamp: number;
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
  /** The merge in progress, if one stopped for conflicts. */
  merge: GitMergeInfo | null;
  /** HEAD's reflog, newest first. */
  reflog: GitReflogEntry[];
  /** `git stash list`, newest first. */
  stashes: GitStashEntry[];
}

export type GitInitResult = GitCommandResult<GitInitData>;
export type GitStatusResult = GitCommandResult<GitStatusData>;
export type GitAddResult = GitCommandResult<GitAddData>;
export type GitCommitResult = GitCommandResult<GitCommitData>;
export type GitLogResult = GitCommandResult<GitLogData>;
export type GitBranchListResult = GitCommandResult<GitBranchListData>;
export type GitBranchCreateResult = GitCommandResult<GitBranchCreateData>;
export type GitSwitchResult = GitCommandResult<GitSwitchData>;
export type GitBranchDeleteResult = GitCommandResult<GitBranchDeleteData>;
export type GitMergeResult = GitCommandResult<GitMergeData>;
export type GitAbortMergeResult = GitCommandResult<GitAbortMergeData>;
export type GitDiffResult = GitCommandResult<GitDiffData>;
export type GitRestoreResult = GitCommandResult<GitRestoreData>;
export type GitResetResult = GitCommandResult<GitResetData>;
export type GitPickResult = GitCommandResult<GitPickData>;
export type GitStashResult = GitCommandResult<GitStashData>;
export type GitReflogResult = GitCommandResult<GitReflogData>;
export type GitRebaseResult = GitCommandResult<GitRebaseData>;

export interface GitRmOptions {
  /** `--cached`: stop tracking the file but keep it on disk. */
  cached?: boolean;
  /** `-r`: allow removing a directory's files. */
  recursive?: boolean;
  /** `-f`: remove even with uncommitted changes. */
  force?: boolean;
}

export type GitRmResult = GitCommandResult<{ removed: string[] }>;

/** `--continue` / `--abort` / `--skip` for operations that stopped for conflicts. */
export type GitSequencerAction = "continue" | "abort" | "skip";

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
  /** `git branch <name> [<start-point>]`: creates a branch (at HEAD by default) without switching. */
  createBranch(name: string, startPoint?: string): Promise<GitBranchCreateResult>;
  /** `git branch -d <name>` (`-D` with `force`): deletes a branch; `-d` refuses unmerged work. */
  deleteBranch(name: string, options?: { force?: boolean }): Promise<GitBranchDeleteResult>;
  /**
   * `git switch <name>`: moves HEAD to an existing branch and updates the working tree.
   * `git switch -` goes back to the previous branch.
   */
  switchBranch(name: string): Promise<GitSwitchResult>;
  /** `git switch -c <name> [<start-point>]`: creates a branch (at HEAD by default) and switches. */
  createAndSwitchBranch(name: string, startPoint?: string): Promise<GitSwitchResult>;
  /**
   * `git switch --detach <revision>` / `git checkout <commit>`: points HEAD straight at a commit
   * ("detached HEAD") and updates the working tree.
   */
  detachHead(revision: string, options?: GitDetachOptions): Promise<GitSwitchResult>;
  /**
   * `git merge <branch>`: fast-forwards when possible, otherwise three-way merges into a merge
   * commit. Conflicts leave the merge in progress (`ok: false`, `data.type: "conflict"`).
   */
  merge(branch: string, options?: GitMergeOptions): Promise<GitMergeResult>;
  /** `git merge --abort`: undoes a merge that stopped for conflicts. */
  abortMerge(): Promise<GitAbortMergeResult>;
  /** `git diff [--staged] [<path>...]`: unified diff of unstaged (or staged) changes. */
  diff(options?: GitDiffOptions): Promise<GitDiffResult>;
  /** `git restore [--staged] [--worktree] [--source <commit>] <path>...` */
  restore(paths: string[], options?: GitRestoreOptions): Promise<GitRestoreResult>;
  /** `git reset [--soft | --mixed | --hard] [<commit>]` and `git reset [<commit>] -- <path>...` */
  reset(options?: GitResetOptions): Promise<GitResetResult>;
  /** `git revert <commit>`: a new commit that undoes `commit`'s changes. */
  revert(commit: string): Promise<GitPickResult>;
  /** `git cherry-pick <commit>`: a new commit on HEAD with `commit`'s changes. */
  cherryPick(commit: string): Promise<GitPickResult>;
  /** `git revert` / `git cherry-pick` with `--continue`, `--abort` or `--skip`. */
  sequencer(
    operation: "revert" | "cherry-pick",
    action: GitSequencerAction,
  ): Promise<GitPickResult>;
  /** `git stash` / `git stash push [-m <message>] [-u]` */
  stashPush(options?: GitStashPushOptions): Promise<GitStashResult>;
  /** `git stash list` */
  stashList(): Promise<GitStashResult>;
  /** `git stash apply` / `git stash pop` (`stash@{n}`, default the newest). */
  stashApply(stash?: string, options?: { pop?: boolean }): Promise<GitStashResult>;
  /** `git stash drop [stash@{n}]` */
  stashDrop(stash?: string): Promise<GitStashResult>;
  /** `git stash show [stash@{n}]`: which files an entry changes. */
  stashShow(stash?: string): Promise<GitStashResult>;
  /** `git reflog [show] [<ref>]`: where HEAD (or a branch) has pointed, newest first. */
  reflog(ref?: string): Promise<GitReflogResult>;
  /** `git rebase <upstream>`: replays the current branch's own commits on top of `upstream`. */
  rebase(upstream: string): Promise<GitRebaseResult>;
  /** `git rebase --continue | --abort | --skip` */
  rebaseControl(action: GitSequencerAction): Promise<GitRebaseResult>;
  /** `git rm [--cached] [-r] [-f] <path>...` */
  rm(paths: string[], options?: GitRmOptions): Promise<GitRmResult>;
  /** Branches as data (no output). Empty outside a repository. Rejects only on internal failures. */
  listBranches(): Promise<BranchState[]>;
  /** Reads repository state without mutating it. Rejects only on unexpected internal failures. */
  snapshot(): Promise<GitRepositorySnapshot>;
}

export type GitEngineFactory = (workspaceId: string) => GitEngine;
