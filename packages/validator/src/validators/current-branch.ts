import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { notInitialized } from "./branches";

/** Passes when HEAD is attached to `branch`, however the learner got there. */
export const currentBranch: ValidatorHandler<ValidatorOfType<"current_branch">> = (
  { branch },
  { repository },
) => {
  if (!repository.initialized) return notInitialized();
  const expected = branch.trim();
  if (repository.currentBranch === expected) return Promise.resolve({ passed: true });
  const where =
    repository.currentBranch === null
      ? "HEAD is detached"
      : `You are on ${repository.currentBranch}`;
  return Promise.resolve({ passed: false, reason: `${where}, not ${expected}.` });
};
