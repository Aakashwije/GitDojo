/** Root directory under which every workspace lives inside the virtual filesystem. */
export const WORKSPACES_ROOT = "/gitdojo";

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class UnsafePathError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`Unsafe path "${path}": ${reason}`);
    this.name = "UnsafePathError";
  }
}

export class InvalidWorkspaceIdError extends Error {
  constructor(readonly workspaceId: string) {
    super(`Invalid workspace id "${workspaceId}"`);
    this.name = "InvalidWorkspaceIdError";
  }
}

export function assertValidWorkspaceId(workspaceId: string): void {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new InvalidWorkspaceIdError(workspaceId);
  }
}

export function workspaceRoot(workspaceId: string): string {
  assertValidWorkspaceId(workspaceId);
  return `${WORKSPACES_ROOT}/${workspaceId}`;
}

/**
 * Normalizes a workspace-relative path to a canonical `a/b/c` form ("" is the workspace root).
 *
 * Any `..` segment is rejected outright instead of being resolved: a learner-supplied path must
 * never be able to name something outside its workspace, even if it would resolve back inside.
 * Leading slashes are treated as workspace-relative, so `/README.md` is `README.md`.
 */
export function normalizeWorkspacePath(path: string): string {
  if (path.includes("\0")) {
    throw new UnsafePathError(path, "contains a null byte");
  }
  if (path.includes("\\")) {
    throw new UnsafePathError(path, "backslashes are not allowed");
  }
  const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) {
    throw new UnsafePathError(path, "path traversal is not allowed");
  }
  return segments.join("/");
}

/** Resolves a workspace-relative path to an absolute path inside that workspace. */
export function resolveWorkspacePath(workspaceId: string, path: string): string {
  const root = workspaceRoot(workspaceId);
  const normalized = normalizeWorkspacePath(path);
  return normalized === "" ? root : `${root}/${normalized}`;
}

/** True when the normalized path is `.git` or anything inside it. */
export function isGitInternalPath(normalizedPath: string): boolean {
  return normalizedPath === ".git" || normalizedPath.startsWith(".git/");
}

export function parentPath(normalizedPath: string): string {
  const index = normalizedPath.lastIndexOf("/");
  return index === -1 ? "" : normalizedPath.slice(0, index);
}
