export type GitErrorCode =
  | "NOT_A_REPOSITORY"
  | "NOTHING_TO_COMMIT"
  | "NO_COMMITS"
  | "FILE_NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "INVALID_BRANCH_NAME"
  | "BRANCH_EXISTS"
  | "BRANCH_NOT_FOUND"
  | "BRANCH_CHECKED_OUT"
  | "BRANCH_NOT_MERGED"
  | "INVALID_REVISION"
  | "CHECKOUT_CONFLICT"
  | "MERGE_CONFLICT"
  | "MERGE_IN_PROGRESS"
  | "UNRESOLVED_CONFLICTS"
  | "NO_MERGE"
  | "NOT_FAST_FORWARD"
  | "OPERATION_IN_PROGRESS"
  | "NO_OPERATION"
  | "LOCAL_CHANGES"
  | "UNMERGED_PATH"
  | "NO_STASH"
  | "NOT_ON_BRANCH"
  | "EMPTY_COMMIT"
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

/**
 * A beginner-friendly explanation of what a command's outcome means. The terminal always shows
 * Git's real message (`terminalMessage`); this is shown alongside it.
 */
export interface GitEducationalError {
  /** Stable id, e.g. `NOT_A_REPOSITORY`, `UNKNOWN_BRANCH`. */
  code: string;
  /** `error`: the command failed. `notice`: it worked, but deserves a word (detached HEAD...). */
  severity: "error" | "notice";
  title: string;
  /** The output Git printed. */
  terminalMessage: string;
  /** Why this happened, in plain words. */
  explanation: string;
  /** The Git concept involved, e.g. `staging` or `branches`. */
  concept?: string;
  /** Likely causes, most specific first; may mention the learner's own files and branches. */
  possibleCauses?: string[];
  /** What to try next. */
  hints?: string[];
  /** A lesson that teaches the concept. */
  learnMore?: { course: string; lesson: string; title: string };
}
