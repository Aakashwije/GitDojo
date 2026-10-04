export type ValidatorDefinition =
  | { type: "repository_initialized" }
  | { type: "file_exists"; file: string }
  | { type: "file_staged"; file: string }
  /** The file is in the last commit and unchanged since. */
  | { type: "file_committed"; file: string }
  /** The file is neither committed nor staged: untracked, ignored or absent. */
  | { type: "file_not_tracked"; file: string }
  /** The file's working-tree status is exactly `status` (as the Working Tree panel shows it). */
  | {
      type: "file_status";
      file: string;
      status: "untracked" | "modified" | "staged" | "committed" | "deleted" | "conflicted";
    }
  | { type: "commit_exists"; message?: string }
  | { type: "commit_count"; count: number }
  | { type: "clean_worktree" }
  | { type: "branch_exists"; branch: string }
  | { type: "branch_not_exists"; branch: string }
  | { type: "current_branch"; branch: string }
  /** Exactly one of `message` (the tip commit's message) or `sameAs` (another branch) is set. */
  | { type: "branch_points_to_commit"; branch: string; message?: string; sameAs?: string }
  /** A commit reachable from `branch`, optionally with `message`, and not reachable from `notOn`. */
  | { type: "commit_on_branch"; branch: string; message?: string; notOn?: string }
  /** Everything on `branch` is also on `into` (default: the current branch). */
  | { type: "branches_merged"; branch: string; into?: string }
  /** A commit with two parents exists on `branch` (default: HEAD), optionally with `message`. */
  | { type: "merge_commit_exists"; branch?: string; message?: string }
  /** A commit with `message` is reachable from `branch`. */
  | { type: "branch_contains_commit"; branch: string; message: string }
  /** `branch` exists and no commit with `message` is reachable from it. */
  | { type: "commit_not_on_branch"; branch: string; message: string }
  /** A `Revert "<message>"` commit is in `branch`'s history (default: HEAD). */
  | { type: "commit_reverted"; message: string; branch?: string }
  /** `onto` is in `branch`'s history, and `branch`'s own commits form a line (no merges). */
  | { type: "branch_rebased"; branch: string; onto: string }
  /** HEAD points straight at a commit instead of a branch. */
  | { type: "head_detached" }
  /** `git stash list` has exactly `count` entries. */
  | { type: "stash_count"; count: number }
  /** A merge is in progress with a conflict (in `file`, if given). */
  | { type: "conflict_exists"; file?: string }
  /** The conflict in `file` has been resolved and staged. */
  | { type: "conflict_resolved"; file: string }
  /** A merge is in progress and every one of its conflicts is resolved. */
  | { type: "all_conflicts_resolved" }
  /** No merge is in progress and HEAD's history has a merge commit (bringing in `branch`). */
  | { type: "merge_completed"; branch?: string };

export type ValidatorType = ValidatorDefinition["type"];

export interface ValidatorResult {
  passed: boolean;
  reason?: string;
}
