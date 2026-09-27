import { type ValidatorHandler, type ValidatorOfType } from "../types";

export const repositoryInitialized: ValidatorHandler<ValidatorOfType<"repository_initialized">> = (
  _definition,
  { repository },
) =>
  Promise.resolve(
    repository.initialized
      ? { passed: true }
      : { passed: false, reason: "This directory is not a Git repository yet." },
  );
