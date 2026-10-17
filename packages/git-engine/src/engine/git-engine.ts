import {
  type AssessmentEvidence,
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
  /** Current working-tree text, when the path exists. */
  content?: string;
}

export interface GitInitData {
  reinitialized: boolean;
  defaultBranch: string;
}

export type ConflictKind = "both modified" | "both added" | "deleted by us" | "deleted by them";

/** Operations that can stop halfway for conflicts and be continued or aborted. */
export type GitOperationKind = "merge" | "revert" | "cherry-pick" | "rebase";

/** How a branch compares with its upstream, as `git status` and `git branch -vv` report it. */
export interface GitUpstreamInfo {
  /** `origin/main` */
  name: string;
  ahead: number;
  behind: number;
  /** The upstream is configured, but its remote-tracking branch does not exist. */
  gone: boolean;
}

export interface GitStatusData {
  /** The current branch's upstream, if it has one. */
  upstream?: GitUpstreamInfo;
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
    /** Rebases: the branch being rebased and where to, and whether it is `git rebase -i`. */
    rebase?: { branch: string; onto: string; interactive?: boolean };
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
  /** Paths changed relative to the first parent (or every path for a root commit). */
  changedPaths: string[];
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
  upstream?: GitUpstreamInfo;
}

export interface GitTagInfo {
  name: string;
  /** The commit the tag names; annotated tags are peeled to it. */
  oid: string;
  annotated: boolean;
  /** Annotated tags only. */
  message?: string;
}

/** A simulated remote: its URL and the branches its (pretend) server has right now. */
export interface GitRemoteInfo {
  name: string;
  url: string;
  branches: { name: string; oid: string }[];
}

/** `refs/remotes/<remote>/<branch>`, shown as `origin/main`. */
export interface GitRemoteTrackingInfo {
  name: string;
  remote: string;
  branch: string;
  oid: string;
}

/** Git is waiting for the learner to edit a file (`git rebase -i`). */
export interface GitPendingEditor {
  file: string;
  purpose: "todo" | "message";
  content: string;
  /** Why the last attempt to close the editor was refused. */
  error?: string;
}

export interface GitShowBranchesOptions {
  /** `-r`: remote-tracking branches only. */
  remotes?: boolean;
  /** `-a`: local and remote-tracking branches. */
  all?: boolean;
  /** `-v` / `-vv`: each branch's commit, subject and upstream. */
  verbose?: boolean;
}

export interface GitTagCreateOptions {
  /** The commit to tag (default HEAD). */
  target?: string;
  /** `-a -m <message>`: an annotated tag. A message alone (`-m`) also makes one, as in Git. */
  message?: string;
  annotated?: boolean;
}

export interface GitTagListOptions {
  /** `-l <pattern>`: only names matching the glob (`v1.*`). */
  pattern?: string;
  /** `-n`: show each annotated tag's message (or the commit subject for lightweight tags). */
  annotations?: boolean;
}

export interface GitTagData {
  tags: GitTagInfo[];
}

export interface GitRemoteData {
  remotes: GitRemoteInfo[];
}

export interface GitFetchData {
  /** Remote-tracking branches that moved, with where from (`null`: new) and where to. */
  updated: { ref: string; from: string | null; to: string }[];
}

export interface GitPushOptions {
  remote?: string;
  /** The local branch to push (default: the current branch). `HEAD` means the current branch. */
  branch?: string;
  /** `-u` / `--set-upstream`: remember the remote branch as this branch's upstream. */
  setUpstream?: boolean;
}

export interface GitPushData {
  status: "up-to-date" | "pushed" | "rejected";
  remote: string;
  branch: string;
  from?: string | null;
  to?: string;
}

/** How `git pull` combines the fetched branch with yours. */
export type GitPullMode = "merge" | "rebase" | "ff-only";

export interface GitPullOptions {
  remote?: string;
  /** The remote branch to pull (default: the current branch's upstream). */
  branch?: string;
  /** Unset: fast-forward when possible, and refuse divergent branches like modern Git. */
  mode?: GitPullMode;
}

export interface GitPullData {
  status: "up-to-date" | "fast-forward" | "merge-commit" | "rebased" | "conflict";
  oid?: string;
}

/** Lesson setup only: a simulated remote that has these local branches, as if cloned from it. */
export interface GitSetupRemoteOptions {
  url?: string;
  /** Local branches the remote has at their current tips; each becomes their upstream. */
  branches: string[];
}

/** Lesson setup only: a commit somebody else pushed to the simulated remote. */
export interface GitSetupRemoteCommitInput {
  branch: string;
  message: string;
  files: Record<string, string | null>;
  author?: GitAuthor;
  timestamp?: number;
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
  /** The merge commit's message, instead of `Merge branch '<branch>'` (used by `git pull`). */
  message?: string;
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

export interface GitRebaseOptions {
  /** `-i`: let the learner edit the plan (pick, reword, squash, fixup, drop) first. */
  interactive?: boolean;
}

export interface GitRebaseData {
  /** `editing`: Git is waiting for the learner to close an editor (see the snapshot's `editor`). */
  status:
    "up-to-date" | "fast-forward" | "rebased" | "conflict" | "aborted" | "editing" | "nothing";
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
  /** Sorted by name. */
  tags: GitTagInfo[];
  /** Simulated remotes, sorted by name. */
  remotes: GitRemoteInfo[];
  /** `refs/remotes/*`, sorted by name. */
  remoteBranches: GitRemoteTrackingInfo[];
  /** Set while Git waits for an editor to close. */
  editor: GitPendingEditor | null;
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
export type GitTagResult = GitCommandResult<GitTagData>;
export type GitRemoteResult = GitCommandResult<GitRemoteData>;
export type GitFetchResult = GitCommandResult<GitFetchData>;
export type GitPushResult = GitCommandResult<GitPushData>;
export type GitPullResult = GitCommandResult<GitPullData>;

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
  /** `git branch [-r | -a] [-v]`: prints the branch list, marking the current branch with `*`. */
  showBranches(options?: GitShowBranchesOptions): Promise<GitBranchListResult>;
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
  /**
   * `git rebase <upstream>`: replays the current branch's own commits on top of `upstream`.
   * With `interactive`, Git first waits for the learner to edit the plan: the result has
   * `data.status: "editing"` and the snapshot's `editor` holds the todo list.
   */
  rebase(upstream: string, options?: GitRebaseOptions): Promise<GitRebaseResult>;
  /** `git rebase --continue | --abort | --skip` */
  rebaseControl(action: GitSequencerAction): Promise<GitRebaseResult>;
  /**
   * The learner saved and closed the editor Git was waiting for. Carries the interactive rebase
   * on; it may stop again for another editor, a conflict, or an invalid todo list.
   */
  closeEditor(content: string): Promise<GitRebaseResult>;
  /** `git tag [-l [<pattern>]] [-n]` */
  listTags(options?: GitTagListOptions): Promise<GitTagResult>;
  /** `git tag <name> [<commit>]`, `git tag -a <name> -m <message> [<commit>]` */
  createTag(name: string, options?: GitTagCreateOptions): Promise<GitTagResult>;
  /** `git tag -d <name>` */
  deleteTag(name: string): Promise<GitTagResult>;
  /** `git remote [-v]` */
  listRemotes(options?: { verbose?: boolean }): Promise<GitRemoteResult>;
  /** `git fetch [<remote>]`: updates remote-tracking branches from the simulated remote. */
  fetch(remote?: string): Promise<GitFetchResult>;
  /** `git push [-u] [<remote> [<branch>]]` to the simulated remote. */
  push(options?: GitPushOptions): Promise<GitPushResult>;
  /** `git pull [--rebase | --no-rebase | --ff-only] [<remote> [<branch>]]` */
  pull(options?: GitPullOptions): Promise<GitPullResult>;
  /**
   * Lesson setup only (no command routes here): adds a simulated remote named `name` that has
   * the given local branches, as if the repository had been cloned from it.
   */
  setupRemote(name: string, options: GitSetupRemoteOptions): Promise<GitCommandResult>;
  /** Lesson setup only: a commit that exists on the simulated remote but not locally yet. */
  setupRemoteCommit(name: string, input: GitSetupRemoteCommitInput): Promise<GitCommandResult>;
  /** `git rm [--cached] [-r] [-f] <path>...` */
  rm(paths: string[], options?: GitRmOptions): Promise<GitRmResult>;
  /** Branches as data (no output). Empty outside a repository. Rejects only on internal failures. */
  listBranches(): Promise<BranchState[]>;
  /** Reads repository state without mutating it. Rejects only on unexpected internal failures. */
  snapshot(): Promise<GitRepositorySnapshot>;
  /** Canonical Git objects used by the server-only capstone grader. */
  exportAssessmentEvidence(attemptId: string): Promise<AssessmentEvidence>;
}

export type GitEngineFactory = (workspaceId: string) => GitEngine;
