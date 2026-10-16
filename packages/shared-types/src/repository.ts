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
  /** Current working-tree text, when the path exists. Used by content-sensitive validators. */
  content?: string;
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
  /** Paths whose blobs differ from the first parent (or every path for a root commit). */
  changedPaths: string[];
}

export interface BranchState {
  name: string;
  /** `null` for an unborn branch (initialized repository without commits). */
  oid: string | null;
  current: boolean;
  /**
   * The remote-tracking branch this branch pushes to and pulls from (`origin/main`), with how far
   * apart the two are. Absent when the branch has no upstream.
   */
  upstream?: UpstreamState;
}

export interface UpstreamState {
  /** `origin/main` */
  name: string;
  /** Commits on the branch that the upstream does not have. */
  ahead: number;
  /** Commits on the upstream that the branch does not have. */
  behind: number;
  /** The upstream is configured but the remote-tracking branch does not exist (any more). */
  gone: boolean;
}

/** A tag: a fixed name for a commit, typically a release. */
export interface TagState {
  name: string;
  /** The commit the tag names (an annotated tag is peeled to its commit). */
  oid: string;
  /** Annotated tags are objects of their own, with a tagger and a message. */
  annotated: boolean;
  /** The annotated tag's message. */
  message?: string;
}

/**
 * A remote-tracking branch such as `origin/main`: the local record of where the remote's branch
 * was the last time this repository fetched, pulled or pushed.
 */
export interface RemoteTrackingBranchState {
  /** `origin/main` */
  name: string;
  remote: string;
  /** The branch's name on the remote, `main`. */
  branch: string;
  oid: string;
}

/**
 * A remote this repository knows about. In GitDojo every remote is **simulated**: it lives inside
 * the learner's workspace and only `git fetch`, `git pull` and `git push` move commits across.
 * `branches` is what the simulated server has right now, which a real repository could only see
 * by fetching.
 */
export interface RemoteState {
  name: string;
  url: string;
  branches: { name: string; oid: string }[];
}

/**
 * Git is waiting for the learner to edit a file in their editor, as `git rebase -i` does for
 * its todo list and for reworded or squashed commit messages.
 */
export interface PendingEditorState {
  /** The file Git opened, e.g. `git-rebase-todo` or `COMMIT_EDITMSG`. */
  file: string;
  /** `todo`: the interactive rebase plan; `message`: a commit message. */
  purpose: "todo" | "message";
  /** The file's current content, comments included. */
  content: string;
  /** Why the last attempt to close the editor was refused, if it was. */
  error?: string;
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
  /** Tags, sorted by name. */
  tags: TagState[];
  /** Simulated remotes, sorted by name. */
  remotes: RemoteState[];
  /** Remote-tracking branches (`origin/main`), sorted by name. */
  remoteBranches: RemoteTrackingBranchState[];
  /** Set while Git waits for the learner to close an editor (`git rebase -i`). */
  editor: PendingEditorState | null;
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
  tags: [],
  remotes: [],
  remoteBranches: [],
  editor: null,
};
