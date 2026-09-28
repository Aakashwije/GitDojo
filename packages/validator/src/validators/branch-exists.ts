import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch } from "./branches";

export const branchExists: ValidatorHandler<ValidatorOfType<"branch_exists">> = (
  { branch },
  { repository },
) =>
  Promise.resolve(
    findBranch(repository, branch)
      ? { passed: true }
      : { passed: false, reason: `There is no branch named ${branch}.` },
  );
