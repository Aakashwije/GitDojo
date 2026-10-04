import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch, historyOf, notInitialized, reachableFrom, tipOf } from "./branches";
import { normalizeLessonPath } from "./paths";

const STATUS_WORDS: Record<string, string> = {
  untracked: "untracked",
  modified: "modified and not staged",
  staged: "staged",
  committed: "unchanged since the last commit",
  deleted: "deleted",
  conflicted: "in conflict",
};

/** The file's working-tree status is exactly `status`. */
export const fileStatus: ValidatorHandler<ValidatorOfType<"file_status">> = (
  { file, status },
  { repository },
) => {
  const path = normalizeLessonPath(file);
  const entry = repository.files.find((candidate) => candidate.path === path);
  if (entry?.status === status) return Promise.resolve({ passed: true });
  const now = entry ? (STATUS_WORDS[entry.status] ?? entry.status) : "not in the working tree";
  return Promise.resolve({
    passed: false,
    reason: `${path} should be ${STATUS_WORDS[status] ?? status}, but it is ${now}.`,
  });
};

/** Passes once `branch` no longer contains a commit with `message`, e.g. after `git reset`. */
export const commitNotOnBranch: ValidatorHandler<ValidatorOfType<"commit_not_on_branch">> = (
  { branch, message },
  { repository },
) => {
  const target = findBranch(repository, branch);
  if (!target) {
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });
  }
  const expected = message.trim();
  const found = historyOf(repository, target.oid).some(
    (commit) => commit.message.trim() === expected,
  );
  return Promise.resolve(
    found ? { passed: false, reason: `${branch} still contains "${expected}".` } : { passed: true },
  );
};

/** A `Revert "<message>"` commit, as `git revert` writes it, is in the branch's history. */
export const commitReverted: ValidatorHandler<ValidatorOfType<"commit_reverted">> = (
  { message, branch },
  { repository },
) => {
  const prefix = `Revert "${message.trim()}"`;
  const found = historyOf(repository, tipOf(repository, branch)).some((commit) =>
    commit.message.startsWith(prefix),
  );
  const where = branch ?? repository.currentBranch ?? "HEAD";
  return Promise.resolve(
    found
      ? { passed: true }
      : { passed: false, reason: `There is no commit on ${where} reverting "${message.trim()}".` },
  );
};

/**
 * `onto`'s tip is part of `branch` and the branch's own commits form a straight line on top of
 * it, which is what `git rebase onto` produces (and a merge does not).
 */
export const branchRebased: ValidatorHandler<ValidatorOfType<"branch_rebased">> = (
  { branch, onto },
  { repository },
) => {
  const source = findBranch(repository, branch);
  const base = findBranch(repository, onto);
  if (!source || !base) {
    return Promise.resolve({
      passed: false,
      reason: `There is no branch named ${source ? onto : branch}.`,
    });
  }
  const history = reachableFrom(repository, source.oid);
  if (!history.has(base.oid)) {
    return Promise.resolve({ passed: false, reason: `${branch} is not based on ${onto} yet.` });
  }
  const shared = reachableFrom(repository, base.oid);
  const merges = repository.allCommits.filter(
    (commit) => history.has(commit.oid) && !shared.has(commit.oid) && commit.parents.length > 1,
  );
  return Promise.resolve(
    merges.length === 0
      ? { passed: true }
      : {
          passed: false,
          reason: `${branch} has a merge commit; its history is not a straight line.`,
        },
  );
};

export const headDetached: ValidatorHandler<ValidatorOfType<"head_detached">> = (
  _definition,
  { repository },
) => {
  if (!repository.initialized) return notInitialized();
  return Promise.resolve(
    repository.currentBranch === null && repository.head !== null
      ? { passed: true }
      : { passed: false, reason: `HEAD is attached to ${repository.currentBranch ?? "a branch"}.` },
  );
};

export const stashCount: ValidatorHandler<ValidatorOfType<"stash_count">> = (
  { count },
  { repository },
) => {
  const actual = repository.stashes.length;
  return Promise.resolve(
    actual === count
      ? { passed: true }
      : {
          passed: false,
          reason: `Expected ${String(count)} stash entr${count === 1 ? "y" : "ies"}, found ${String(actual)}.`,
        },
  );
};
