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

// Same rule as the Git engine's `git add`: a marker is a whole line starting with seven of them.
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?: |$)/m;

/**
 * Passes while `file` is still in conflict but its markers have been edited out: the edit only
 * needs staging. Together with `conflict_resolved`, it tells "edited, not staged yet" apart from
 * "not edited yet" and "done".
 */
export const conflictReadyToStage: ValidatorHandler<ValidatorOfType<"conflict_ready_to_stage">> = (
  { file },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const conflict = repository.conflicts.find((candidate) => candidate.path === path);
  if (!conflict) return Promise.resolve({ passed: false, reason: `${path} is not in conflict.` });
  if (conflict.resolved) {
    return Promise.resolve({ passed: false, reason: `${path} is already resolved and staged.` });
  }
  const content = repository.files.find((candidate) => candidate.path === path)?.content;
  if (content === undefined) {
    return Promise.resolve({ passed: false, reason: `${path} is not in the working tree.` });
  }
  return Promise.resolve(
    CONFLICT_MARKER.test(content)
      ? { passed: false, reason: `${path} still contains conflict markers.` }
      : { passed: true },
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
