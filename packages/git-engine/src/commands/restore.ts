import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitRestoreOptions, type GitRestoreResult } from "../engine/git-engine";
import { readMergeState, unresolvedConflicts } from "../engine/merge-state";
import { matchesPathspec, parsePathspecs } from "../engine/pathspec";
import { isRepository, resolveRefOrNull } from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import {
  applyWorkingTreeUpdates,
  readBlob,
  readIndexFiles,
  readTreeFiles,
  resetIndexPaths,
} from "../engine/working-tree";

export const RESTORE_USAGE =
  "usage: git restore [--staged] [--worktree] [--source=<commit>] <pathspec>...";

/**
 * `git restore <path>` puts working-tree files back to their staged version (discarding
 * unstaged edits), `git restore --staged <path>` unstages (the index goes back to HEAD), and
 * `--source <commit>` takes content from another commit.
 */
export async function runRestore(
  ctx: GitContext,
  rawPaths: string[],
  options: GitRestoreOptions = {},
): Promise<GitRestoreResult> {
  if (rawPaths.length === 0) {
    return failure(
      gitError("INVALID_ARGUMENT", `fatal: you must specify path(s) to restore\n${RESTORE_USAGE}`),
    );
  }
  if (!(await isRepository(ctx))) return notARepository();
  const parsed = parsePathspecs(rawPaths);
  if (!parsed.ok) return failure(parsed.error);
  const { pathspecs } = parsed;

  const staged = options.staged ?? false;
  const worktree = options.worktree ?? !staged;

  let source: string | null;
  if (options.source !== undefined) {
    source = await resolveRevision(ctx, options.source);
    if (source === null) {
      return failure(gitError("INVALID_REVISION", `fatal: could not resolve ${options.source}`));
    }
  } else {
    source = await resolveRefOrNull(ctx, "HEAD");
  }
  const sourceTree = await readTreeFiles(ctx, source);
  const index = await readIndexFiles(ctx);

  // The paths each pathspec can restore: Git only knows tracked paths (or the source's).
  const known = new Set([...index.keys(), ...sourceTree.keys()]);
  const selected = new Set<string>();
  for (const [position, pathspec] of pathspecs.entries()) {
    const matches = [...known].filter((path) => matchesPathspec(path, pathspec));
    if (matches.length === 0) {
      return failure(
        gitError(
          "FILE_NOT_FOUND",
          `error: pathspec '${rawPaths[position] ?? pathspec}' did not match any file(s) known to git`,
        ),
      );
    }
    for (const path of matches) selected.add(path);
  }

  const conflicted = unresolvedConflicts(await readMergeState(ctx)).find((conflict) =>
    selected.has(conflict.path),
  );
  if (conflicted && worktree && !staged) {
    return failure(gitError("UNMERGED_PATH", `error: path '${conflicted.path}' is unmerged`));
  }

  const paths = [...selected].sort((a, b) => a.localeCompare(b));
  if (staged) await resetIndexPaths(ctx, paths, sourceTree, source);

  if (worktree) {
    // Without --staged, files come back from the index (or --source); with both, from HEAD.
    const from = staged || options.source !== undefined ? sourceTree : await readIndexFiles(ctx);
    await applyWorkingTreeUpdates(
      ctx,
      await Promise.all(
        paths.map(async (path) => {
          const oid = from.get(path);
          return {
            path,
            content: oid === undefined ? null : await readBlob(ctx, oid),
            stage: false,
          };
        }),
      ),
    );
  }
  // Real `git restore` is silent on success.
  return success("", { restored: paths });
}
