import {
  type GitCommandResult,
  type GitEngineError,
  type GitErrorCode,
} from "@gitdojo/shared-types";

export function gitError(code: GitErrorCode, message: string, cause?: unknown): GitEngineError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

export function success<T>(output: string, data: T): GitCommandResult<T> {
  return { ok: true, output, data };
}

export function failure<T>(
  error: GitEngineError,
  output: string = error.message,
): GitCommandResult<T> {
  return { ok: false, output, error };
}

export const NOT_A_REPOSITORY_MESSAGE =
  "fatal: not a git repository (or any of the parent directories): .git";

export function notARepository<T>(): GitCommandResult<T> {
  return failure(gitError("NOT_A_REPOSITORY", NOT_A_REPOSITORY_MESSAGE));
}

/**
 * Converts an unexpected exception into a UI-safe result. The original error is kept as `cause`
 * for debugging but its message and stack never reach the terminal.
 */
export function unexpected<T>(cause: unknown): GitCommandResult<T> {
  return failure(
    gitError(
      "UNKNOWN",
      "fatal: GitDojo's Git engine hit an unexpected problem. Try resetting the lesson.",
      cause,
    ),
  );
}
