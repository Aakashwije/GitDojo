export type GitErrorCode =
  | "NOT_A_REPOSITORY"
  | "NOTHING_TO_COMMIT"
  | "NO_COMMITS"
  | "FILE_NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "INVALID_BRANCH_NAME"
  | "BRANCH_EXISTS"
  | "BRANCH_NOT_FOUND"
  | "CHECKOUT_CONFLICT"
  | "MERGE_CONFLICT"
  | "MERGE_IN_PROGRESS"
  | "UNRESOLVED_CONFLICTS"
  | "NO_MERGE"
  | "UNKNOWN";

/**
 * UI-safe error. `message` is what a learner may see; `cause` is kept for
 * debugging and must never be rendered.
 */
export interface GitEngineError {
  code: GitErrorCode;
  message: string;
  cause?: unknown;
}

export interface GitCommandResult<T = unknown> {
  ok: boolean;
  /** Git-like terminal output. Empty string for silent commands such as `git add`. */
  output: string;
  data?: T;
  error?: GitEngineError;
}

export interface GitAuthor {
  name: string;
  email: string;
}
