import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { normalizeLessonPath } from "./paths";

/** Passes when the file is in the last commit and has not changed since. */
export const fileCommitted: ValidatorHandler<ValidatorOfType<"file_committed">> = (
  { file },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const entry = repository.files.find((candidate) => candidate.path === path);
  if (entry?.status === "committed") return Promise.resolve({ passed: true });
  const reason =
    entry === undefined
      ? `${path} is not in the repository.`
      : entry.status === "untracked"
        ? `${path} has never been committed.`
        : `${path} has changes that are not committed.`;
  return Promise.resolve({ passed: false, reason });
};

/**
 * Passes while Git does not track the file: it is untracked, ignored by `.gitignore`, or does not
 * exist. Pair it with `clean_worktree` to require that a file is ignored rather than committed.
 */
export const fileNotTracked: ValidatorHandler<ValidatorOfType<"file_not_tracked">> = (
  { file },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const tracked =
    repository.stagedFiles.some((entry) => entry.path === path && entry.change !== "deleted") ||
    repository.files.some(
      (entry) => entry.path === path && entry.status !== "untracked" && entry.status !== "ignored",
    );
  return Promise.resolve(
    tracked ? { passed: false, reason: `Git is tracking ${path}.` } : { passed: true },
  );
};
