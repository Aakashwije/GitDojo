import git from "isomorphic-git";
import { normalizeWorkspacePath, UnsafePathError } from "../filesystem/paths";
import { pathExists } from "../filesystem/fs-helpers";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitAddResult, type GitStatusEntry } from "../engine/git-engine";
import { isRepository } from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";

function matchesPathspec(path: string, pathspec: string): boolean {
  return pathspec === "" || path === pathspec || path.startsWith(`${pathspec}/`);
}

/**
 * `git add <pathspec>...`. Like modern Git, adding a pathspec also stages deletions under it,
 * so `git add .` records every change in the working tree.
 */
export async function runAdd(ctx: GitContext, rawPaths: string[]): Promise<GitAddResult> {
  if (rawPaths.length === 0) {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?",
      ),
    );
  }
  if (!(await isRepository(ctx))) return notARepository();

  const pathspecs: string[] = [];
  for (const rawPath of rawPaths) {
    try {
      pathspecs.push(normalizeWorkspacePath(rawPath));
    } catch (error) {
      if (!(error instanceof UnsafePathError)) throw error;
      return failure(
        gitError("INVALID_ARGUMENT", `fatal: ${rawPath}: '${rawPath}' is outside repository`),
      );
    }
  }

  const entries = await readStatusEntries(ctx);
  const selected = new Map<string, GitStatusEntry>();

  // Validate every pathspec before touching the index so a typo leaves nothing half-staged.
  for (const [index, pathspec] of pathspecs.entries()) {
    const matches = entries.filter((entry) => matchesPathspec(entry.path, pathspec));
    const existsOnDisk =
      pathspec === "" || (await pathExists(ctx.fs.promises, `${ctx.dir}/${pathspec}`));
    if (matches.length === 0 && !existsOnDisk) {
      return failure(
        gitError(
          "FILE_NOT_FOUND",
          `fatal: pathspec '${rawPaths[index] ?? pathspec}' did not match any files`,
        ),
      );
    }
    for (const entry of matches) selected.set(entry.path, entry);
  }

  const staged: string[] = [];
  const removed: string[] = [];
  for (const entry of selected.values()) {
    if (entry.unstaged === null) continue;
    if (entry.unstaged === "deleted") {
      await git.remove({ fs: ctx.fs, dir: ctx.dir, filepath: entry.path });
      removed.push(entry.path);
    } else {
      await git.add({ fs: ctx.fs, dir: ctx.dir, filepath: entry.path });
      staged.push(entry.path);
    }
  }

  // Real `git add` is silent on success.
  return success("", { staged, removed });
}
