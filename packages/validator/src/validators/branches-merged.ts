import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch, reachableFrom, tipOf } from "./branches";

/** Passes once every commit on `branch` is part of `into` (by fast-forward or merge commit). */
export const branchesMerged: ValidatorHandler<ValidatorOfType<"branches_merged">> = (
  { branch, into },
  { repository },
) => {
  const source = findBranch(repository, branch);
  if (!source)
    return Promise.resolve({ passed: false, reason: `There is no branch named ${branch}.` });
  const target = tipOf(repository, into);
  const targetName = into ?? repository.currentBranch ?? "HEAD";
  if (target === null) {
    return Promise.resolve({ passed: false, reason: `${targetName} has no commits yet.` });
  }
  return Promise.resolve(
    reachableFrom(repository, target).has(source.oid)
      ? { passed: true }
      : { passed: false, reason: `${branch} has not been merged into ${targetName}.` },
  );
};
