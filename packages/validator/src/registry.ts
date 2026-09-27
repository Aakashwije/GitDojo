import { type ValidatorType } from "@gitdojo/shared-types";
import { type ValidatorRegistry } from "./types";
import { cleanWorktree } from "./validators/clean-worktree";
import { commitCount } from "./validators/commit-count";
import { commitExists } from "./validators/commit-exists";
import { fileExists } from "./validators/file-exists";
import { fileStaged } from "./validators/file-staged";
import { repositoryInitialized } from "./validators/repository-initialized";

export const validatorRegistry: ValidatorRegistry = {
  repository_initialized: repositoryInitialized,
  file_exists: fileExists,
  file_staged: fileStaged,
  commit_exists: commitExists,
  commit_count: commitCount,
  clean_worktree: cleanWorktree,
};

export const SUPPORTED_VALIDATOR_TYPES = Object.keys(validatorRegistry) as ValidatorType[];
