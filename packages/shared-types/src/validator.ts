export type ValidatorDefinition =
  | { type: "repository_initialized" }
  | { type: "file_exists"; file: string }
  | { type: "file_staged"; file: string }
  | { type: "commit_exists"; message?: string }
  | { type: "commit_count"; count: number }
  | { type: "clean_worktree" }
  | { type: "branch_exists"; branch: string }
  | { type: "branch_not_exists"; branch: string }
  | { type: "current_branch"; branch: string }
  /** Exactly one of `message` (the tip commit's message) or `sameAs` (another branch) is set. */
  | { type: "branch_points_to_commit"; branch: string; message?: string; sameAs?: string }
  /** A commit reachable from `branch`, optionally with `message`, and not reachable from `notOn`. */
  | { type: "commit_on_branch"; branch: string; message?: string; notOn?: string };

export type ValidatorType = ValidatorDefinition["type"];

export interface ValidatorResult {
  passed: boolean;
  reason?: string;
}
