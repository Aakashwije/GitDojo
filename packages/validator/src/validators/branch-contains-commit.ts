import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch, historyOf } from "./branches";

export const branchContainsCommit: ValidatorHandler<ValidatorOfType<"branch_contains_commit">> = (
  { branch, message },
  { repository },
) => {
  const target = findBranch(repository, branch);
  if (!target)
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });
  const expected = message.trim();
  return Promise.resolve(
    historyOf(repository, target.oid).some((commit) => commit.message.trim() === expected)
      ? { passed: true }
      : { passed: false, reason: `${branch} does not contain a commit "${expected}".` },
  );
};
