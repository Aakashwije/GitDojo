import { type ValidatorType } from "@gitdojo/shared-types";
import { type ValidatorRegistry } from "./types";
import { branchExists } from "./validators/branch-exists";
import { branchNotExists } from "./validators/branch-not-exists";
import { branchPointsToCommit } from "./validators/branch-points-to-commit";
import { cleanWorktree } from "./validators/clean-worktree";
import { commitCount } from "./validators/commit-count";
import { commitExists } from "./validators/commit-exists";
import { commitOnBranch } from "./validators/commit-on-branch";
import { currentBranch } from "./validators/current-branch";
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
  branch_exists: branchExists,
  branch_not_exists: branchNotExists,
  current_branch: currentBranch,
  branch_points_to_commit: branchPointsToCommit,
  commit_on_branch: commitOnBranch,
};

export const SUPPORTED_VALIDATOR_TYPES = Object.keys(validatorRegistry) as ValidatorType[];
