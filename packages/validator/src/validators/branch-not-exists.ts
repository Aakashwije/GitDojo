import { type ValidatorHandler, type ValidatorOfType } from "../types";
import { findBranch } from "./branches";

export const branchNotExists: ValidatorHandler<ValidatorOfType<"branch_not_exists">> = (
  { branch },
  { repository },
) =>
  Promise.resolve(
    findBranch(repository, branch)
      ? { passed: false, reason: `A branch named ${branch} still exists.` }
      : { passed: true },
  );
