import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch, reachableFrom } from "./branches";

/**
 * Passes when `branch` contains a commit (with `message`, if given) that `notOn` does not.
 * `notOn` is how a lesson says "a commit made on the feature branch, not on main".
 */
export const commitOnBranch: ValidatorHandler<ValidatorOfType<"commit_on_branch">> = (
  { branch, message, notOn },
  { repository },
) => {
  const target = findBranch(repository, branch);
  if (!target)
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });

  const onBranch = reachableFrom(repository, target.oid);
  const excludedTip = notOn === undefined ? undefined : findBranch(repository, notOn);
  const excluded = excludedTip ? reachableFrom(repository, excludedTip.oid) : new Set<string>();
  const expected = message?.trim();

  const found = repository.allCommits.some(
    (commit) =>
      onBranch.has(commit.oid) &&
      !excluded.has(commit.oid) &&
      (expected === undefined || commit.message.trim() === expected),
  );
  if (found) return Promise.resolve({ passed: true });

  const scope = notOn === undefined ? `on ${branch}` : `on ${branch} that is not on ${notOn}`;
  return Promise.resolve({
    passed: false,
    reason:
      expected === undefined
        ? `There is no commit ${scope}.`
        : `There is no commit ${scope} with the message "${expected}".`,
  });
};
