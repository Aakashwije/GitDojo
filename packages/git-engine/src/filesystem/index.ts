export { createLightningFs, type LightningFsOptions } from "./lightning-fs";
export {
  assertValidWorkspaceId,
  InvalidWorkspaceIdError,
  isGitInternalPath,
  normalizeWorkspacePath,
  resolveWorkspacePath,
  UnsafePathError,
  workspaceRoot,
  WORKSPACES_ROOT,
} from "./paths";
export { type GitDojoFs, type VirtualFileEntry, type VirtualFileSystem } from "./types";
export { FileNotFoundError, WorkspaceFileSystem } from "./workspace-file-system";
