import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch } from "./branches";

/** Checks where a branch points: at a commit with `message`, or at the same commit as `sameAs`. */
export const branchPointsToCommit: ValidatorHandler<ValidatorOfType<"branch_points_to_commit">> = (
  { branch, message, sameAs },
  { repository },
) => {
  const target = findBranch(repository, branch);
  if (!target)
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });

  if (sameAs !== undefined) {
    const other = findBranch(repository, sameAs);
    if (!other)
      return Promise.resolve({ passed: false, reason: `There is no branch named ${sameAs}.` });
    return Promise.resolve(
      other.oid === target.oid
        ? { passed: true }
        : { passed: false, reason: `${branch} and ${sameAs} point to different commits.` },
    );
  }

  const tip = repository.allCommits.find((commit) => commit.oid === target.oid);
  const expected = (message ?? "").trim();
  if (tip?.message.trim() === expected) return Promise.resolve({ passed: true });
  return Promise.resolve({
    passed: false,
    reason: `${branch} points to "${tip?.message.split("\n")[0] ?? target.oid.slice(0, 7)}", not "${expected}".`,
  });
};
