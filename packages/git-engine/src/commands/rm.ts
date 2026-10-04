import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitRmOptions, type GitRmResult } from "../engine/git-engine";
import { readMergeState, writeMergeState } from "../engine/merge-state";
import { matchesPathspec, parsePathspecs } from "../engine/pathspec";
import { isRepository } from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";
import { applyWorkingTreeUpdates, readIndexFiles } from "../engine/working-tree";

export const RM_USAGE = "usage: git rm [--cached] [-r] [-f] <pathspec>...";

/**
 * `git rm <path>` deletes tracked files and stages the deletion; `git rm --cached <path>` only
 * stops tracking them. Like Git, it refuses to throw away uncommitted changes without `-f`.
 */
export async function runRm(
  ctx: GitContext,
  rawPaths: string[],
  { cached = false, recursive = false, force = false }: GitRmOptions = {},
): Promise<GitRmResult> {
  if (rawPaths.length === 0) return failure(gitError("INVALID_ARGUMENT", RM_USAGE));
  if (!(await isRepository(ctx))) return notARepository();
  const parsed = parsePathspecs(rawPaths);
  if (!parsed.ok) return failure(parsed.error);

  const index = await readIndexFiles(ctx);
  const merge = await readMergeState(ctx);
  const conflicted = new Set(
    (merge?.conflicts ?? []).filter((conflict) => !conflict.resolved).map((c) => c.path),
  );
  const tracked = [...new Set([...index.keys(), ...conflicted])];
  const selected = new Set<string>();
  for (const [position, pathspec] of parsed.pathspecs.entries()) {
    const raw = rawPaths[position] ?? pathspec;
    const matches = tracked.filter((path) => matchesPathspec(path, pathspec));
    if (matches.length === 0) {
      return failure(
        gitError("FILE_NOT_FOUND", `fatal: pathspec '${raw}' did not match any files`),
      );
    }
    if (!recursive && !matches.includes(pathspec)) {
      return failure(
        gitError("INVALID_ARGUMENT", `fatal: not removing '${raw}' recursively without -r`),
      );
    }
    for (const path of matches) selected.add(path);
  }

  const paths = [...selected].sort((a, b) => a.localeCompare(b));
  if (!force && !cached) {
    const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
    const changed = paths.filter((path) => {
      const entry = status.get(path);
      return (
        !conflicted.has(path) &&
        entry !== undefined &&
        (entry.staged !== null || entry.unstaged === "modified")
      );
    });
    if (changed.length > 0) {
      const plural = changed.length === 1 ? "file has" : "files have";
      return failure(
        gitError(
          "LOCAL_CHANGES",
          [
            `error: the following ${plural} local modifications:`,
            ...changed.map((path) => `    ${path}`),
            "(use --cached to keep the file, or -f to force removal)",
          ].join("\n"),
        ),
      );
    }
  }

  if (cached) {
    for (const path of paths) await git.remove({ fs: ctx.fs, dir: ctx.dir, filepath: path });
  } else {
    await applyWorkingTreeUpdates(
      ctx,
      paths.map((path) => ({ path, content: null })),
    );
  }
  // Removing a conflicted path is one way to resolve it.
  if (merge && paths.some((path) => conflicted.has(path))) {
    for (const conflict of merge.conflicts) {
      if (paths.includes(conflict.path)) conflict.resolved = true;
    }
    await writeMergeState(ctx, merge);
  }
  return success(paths.map((path) => `rm '${path}'`).join("\n"), { removed: paths });
}
