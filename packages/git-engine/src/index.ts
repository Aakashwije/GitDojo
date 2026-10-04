import "./polyfills";

export * from "./filesystem";
export { NOT_A_REPOSITORY_MESSAGE } from "./engine/errors";
export { COMMIT_MESSAGE_REQUIRED } from "./commands/commit";
export { formatGitDate } from "./commands/log";
export { isValidBranchName } from "./commands/branch";
export { MISSING_BRANCH_ARGUMENT } from "./commands/switch";
export { MERGE_USAGE } from "./commands/merge";
export { REBASE_USAGE } from "./commands/rebase";
export { RESTORE_USAGE } from "./commands/restore";
export { RM_USAGE } from "./commands/rm";
export { formatFileDiff, diffHunks } from "./engine/diff";
export { hasConflictMarkers, mergeText } from "./engine/text-merge";
export { classifyStatusRow, type StatusRow } from "./engine/status-matrix";
export {
  createGitEngine,
  IsomorphicGitEngine,
  type GitEngineOptions,
} from "./engine/isomorphic-git-engine";
export * from "./engine/git-engine";
