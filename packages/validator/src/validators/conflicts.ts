import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { normalizeLessonPath } from "./paths";

const NO_MERGE = "No merge is in progress.";

export const conflictExists: ValidatorHandler<ValidatorOfType<"conflict_exists">> = (
  { file },
  { repository },
) => {
  if (repository.merge === null) return Promise.resolve({ passed: false, reason: NO_MERGE });
  const path = file === undefined ? undefined : normalizeLessonPath(file);
  const found = repository.conflicts.some(
    (conflict) => path === undefined || conflict.path === path,
  );
  return Promise.resolve(
    found
      ? { passed: true }
      : { passed: false, reason: path ? `${path} is not in conflict.` : "There are no conflicts." },
  );
};

/** Passes once the markers are gone from `file` and it has been staged with `git add`. */
export const conflictResolved: ValidatorHandler<ValidatorOfType<"conflict_resolved">> = (
  { file },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const conflict = repository.conflicts.find((candidate) => candidate.path === path);
  if (!conflict) return Promise.resolve({ passed: false, reason: `${path} is not in conflict.` });
  return Promise.resolve(
    conflict.resolved
      ? { passed: true }
      : { passed: false, reason: `${path} still needs to be edited and staged with git add.` },
  );
};

export const allConflictsResolved: ValidatorHandler<ValidatorOfType<"all_conflicts_resolved">> = (
  _definition,
  { repository },
) => {
  if (repository.merge === null) return Promise.resolve({ passed: false, reason: NO_MERGE });
  const open = repository.conflicts.filter((conflict) => !conflict.resolved);
  if (repository.conflicts.length === 0) {
    return Promise.resolve({ passed: false, reason: "This merge has no conflicts." });
  }
  return Promise.resolve(
    open.length === 0
      ? { passed: true }
      : {
          passed: false,
          reason: `Still in conflict: ${open.map((conflict) => conflict.path).join(", ")}.`,
        },
  );
};
