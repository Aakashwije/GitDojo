import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { historyOf, tipOf } from "./branches";

/** A commit with two or more parents in the history of `branch` (default: HEAD). */
export const mergeCommitExists: ValidatorHandler<ValidatorOfType<"merge_commit_exists">> = (
  { branch, message },
  { repository },
) => {
  const expected = message?.trim();
  const found = historyOf(repository, tipOf(repository, branch)).some(
    (commit) =>
      commit.parents.length > 1 && (expected === undefined || commit.message.trim() === expected),
  );
  if (found) return Promise.resolve({ passed: true });
  const where = branch ?? repository.currentBranch ?? "HEAD";
  return Promise.resolve({
    passed: false,
    reason:
      expected === undefined
        ? `There is no merge commit on ${where}.`
        : `There is no merge commit on ${where} with the message "${expected}".`,
  });
};
