import { type ValidatorHandler, type ValidatorOfType } from "../types";

export const cleanWorktree: ValidatorHandler<ValidatorOfType<"clean_worktree">> = (
  _definition,
  { repository },
) => {
  if (!repository.initialized) {
    return Promise.resolve({
      passed: false,
      reason: "This directory is not a Git repository yet.",
    });
  }
  if (repository.stagedFiles.length > 0) {
    return Promise.resolve({ passed: false, reason: "There are staged changes to commit." });
  }
  const dirty = repository.files.filter(
    (file) => file.status !== "committed" && file.status !== "ignored",
  );
  return Promise.resolve(
    dirty.length === 0
      ? { passed: true }
      : { passed: false, reason: `Uncommitted changes in ${dirty.map((f) => f.path).join(", ")}.` },
  );
};
