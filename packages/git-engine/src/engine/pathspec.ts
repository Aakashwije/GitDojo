import { type GitEngineError } from "@gitdojo/shared-types";
import { normalizeWorkspacePath, UnsafePathError } from "../filesystem/paths";
import { gitError } from "./errors";

/** `""` (from `.`) matches everything; otherwise the path itself or anything inside it. */
export function matchesPathspec(path: string, pathspec: string): boolean {
  return pathspec === "" || path === pathspec || path.startsWith(`${pathspec}/`);
}

export function matchesAny(path: string, pathspecs: readonly string[]): boolean {
  return pathspecs.some((pathspec) => matchesPathspec(path, pathspec));
}

/**
 * Normalizes learner-typed paths. A path outside the repository is refused with Git's message,
 * so nothing can name a file outside the workspace.
 */
export function parsePathspecs(
  rawPaths: readonly string[],
): { ok: true; pathspecs: string[] } | { ok: false; error: GitEngineError } {
  const pathspecs: string[] = [];
  for (const rawPath of rawPaths) {
    try {
      pathspecs.push(normalizeWorkspacePath(rawPath));
    } catch (error) {
      if (!(error instanceof UnsafePathError)) throw error;
      return {
        ok: false,
        error: gitError(
          "INVALID_ARGUMENT",
          `fatal: ${rawPath}: '${rawPath}' is outside repository`,
        ),
      };
    }
  }
  return { ok: true, pathspecs };
}
