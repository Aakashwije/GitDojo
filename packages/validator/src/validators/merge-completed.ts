import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch, historyOf, reachableFrom } from "./branches";

/**
 * Passes when no merge is in progress and HEAD's history has a merge commit; with `branch`, that
 * branch must also be merged in. A fast-forward creates no merge commit and does not count.
 */
export const mergeCompleted: ValidatorHandler<ValidatorOfType<"merge_completed">> = (
  { branch },
  { repository },
) => {
  if (repository.merge !== null) {
    return Promise.resolve({
      passed: false,
      reason: "The merge is still in progress. Commit it to finish.",
    });
  }
  if (!historyOf(repository, repository.head).some((commit) => commit.parents.length > 1)) {
    return Promise.resolve({ passed: false, reason: "No merge commit has been made yet." });
  }
  if (branch !== undefined) {
    const source = findBranch(repository, branch);
    if (
      !source ||
      repository.head === null ||
      !reachableFrom(repository, repository.head).has(source.oid)
    ) {
      return Promise.resolve({ passed: false, reason: `${branch} has not been merged in.` });
    }
  }
  return Promise.resolve({ passed: true });
};
