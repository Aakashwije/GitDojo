import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitResetMode, type GitResetOptions, type GitResetResult } from "../engine/git-engine";
import { clearMergeState, operationKind, readMergeState } from "../engine/merge-state";
import { matchesPathspec, parsePathspecs } from "../engine/pathspec";
import { logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  describeCommit,
  isRepository,
  moveHead,
  resolveRefOrNull,
} from "../engine/repository";
import { resolveRevision, unknownRevisionMessage } from "../engine/revisions";
import { readStatusEntries } from "../engine/status-matrix";
import {
  applyWorkingTreeUpdates,
  readBlob,
  readIndexFiles,
  readTreeFiles,
  resetIndexPaths,
  updatesFromTree,
} from "../engine/working-tree";

/**
 * Makes the index and every tracked file match `target`, discarding local changes (including
 * conflict markers), without moving HEAD. `git reset --hard` plus the aborts of stopped
 * operations use it.
 */
export async function forceCheckout(ctx: GitContext, target: string | null): Promise<void> {
  const [index, headTree, targetTree] = await Promise.all([
    readIndexFiles(ctx),
    readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD")),
    readTreeFiles(ctx, target),
  ]);
  const tracked = new Set([...index.keys(), ...headTree.keys(), ...targetTree.keys()]);
  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  const changed = [...tracked].filter(
    (path) =>
      index.get(path) !== targetTree.get(path) || (status.get(path)?.unstaged ?? null) !== null,
  );
  await applyWorkingTreeUpdates(
    ctx,
    await updatesFromTree(changed, targetTree, (oid) => readBlob(ctx, oid)),
  );
}

/**
 * `git reset [<commit>] -- <paths>`: makes those index entries match the commit (default HEAD),
 * i.e. unstages them. HEAD and the working tree do not move.
 */
async function resetPaths(
  ctx: GitContext,
  commit: string | undefined,
  rawPaths: string[],
): Promise<GitResetResult> {
  const parsed = parsePathspecs(rawPaths);
  if (!parsed.ok) return failure(parsed.error);
  const head = await resolveRefOrNull(ctx, "HEAD");
  const target = commit === undefined ? head : await resolveRevision(ctx, commit);
  if (commit !== undefined && target === null) {
    return failure(gitError("INVALID_REVISION", unknownRevisionMessage(commit)));
  }
  const tree = await readTreeFiles(ctx, target);
  const index = await readIndexFiles(ctx);
  const candidates = [...new Set([...index.keys(), ...tree.keys()])];
  const paths = candidates
    .filter((path) => parsed.pathspecs.some((pathspec) => matchesPathspec(path, pathspec)))
    .sort((a, b) => a.localeCompare(b));
  await resetIndexPaths(ctx, paths, tree, target);
  return success(await unstagedReport(ctx), { mode: "mixed", from: head, to: head, paths });
}

/** `Unstaged changes after reset:` and one `M\tpath` line per tracked file left modified. */
async function unstagedReport(ctx: GitContext): Promise<string> {
  const lines = (await readStatusEntries(ctx)).flatMap((entry) => {
    if (entry.unstaged === "modified") return [`M\t${entry.path}`];
    if (entry.unstaged === "deleted") return [`D\t${entry.path}`];
    return [];
  });
  return lines.length === 0 ? "" : ["Unstaged changes after reset:", ...lines].join("\n");
}

/**
 * `git reset [--soft | --mixed | --hard] [<commit>]` moves the current branch (or a detached
 * HEAD) to `commit`, then:
 *
 * - `--soft`: nothing else; the old commits' changes stay staged;
 * - `--mixed` (default): the staging area matches the commit; changes stay in the files;
 * - `--hard`: the staging area and tracked files match the commit; uncommitted work is gone.
 *
 * Untracked files are never touched, except where the commit has a file of the same name.
 */
export async function runReset(
  ctx: GitContext,
  options: GitResetOptions = {},
): Promise<GitResetResult> {
  if (!(await isRepository(ctx))) return notARepository();
  if (options.paths !== undefined && options.paths.length > 0) {
    if (options.mode === "soft" || options.mode === "hard") {
      return failure(
        gitError("INVALID_ARGUMENT", `fatal: Cannot do ${options.mode} reset with paths.`),
      );
    }
    return resetPaths(ctx, options.commit, options.paths);
  }

  const mode: GitResetMode = options.mode ?? "mixed";
  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  const target = await resolveRevision(ctx, options.commit ?? "HEAD");
  // `git reset README.md`: a word that is no revision but names a tracked file is a path.
  if (target === null && options.commit !== undefined && options.mode === undefined) {
    const parsed = parsePathspecs([options.commit]);
    const known = new Set([
      ...(await readIndexFiles(ctx)).keys(),
      ...(await readTreeFiles(ctx, head)).keys(),
    ]);
    if (parsed.ok && [...known].some((path) => matchesPathspec(path, parsed.pathspecs[0] ?? ""))) {
      return resetPaths(ctx, undefined, [options.commit]);
    }
  }
  if (target === null) {
    if (head === null && options.commit === undefined) {
      // An unborn branch: `git reset` simply empties the staging area.
      const index = await readIndexFiles(ctx);
      await resetIndexPaths(ctx, index.keys(), new Map(), null);
      return success("", { mode, from: null, to: null, paths: [] });
    }
    return failure(gitError("INVALID_REVISION", unknownRevisionMessage(options.commit ?? "HEAD")));
  }

  const operation = await readMergeState(ctx);
  if (operation && mode === "soft") {
    return failure(
      gitError(
        "OPERATION_IN_PROGRESS",
        `fatal: Cannot do a soft reset in the middle of a ${operationKind(operation) === "merge" ? "merge" : "conflict resolution"}.`,
      ),
    );
  }

  const targetTree = await readTreeFiles(ctx, target);
  if (mode !== "soft") {
    const [index, headTree] = await Promise.all([readIndexFiles(ctx), readTreeFiles(ctx, head)]);
    if (mode === "hard") {
      // Tracked files (and the commit's files) are overwritten; everything else is left alone.
      await forceCheckout(ctx, target);
    } else {
      const tracked = new Set([...index.keys(), ...headTree.keys(), ...targetTree.keys()]);
      await resetIndexPaths(ctx, tracked, targetTree, target);
    }
    // Resetting the index or files abandons a stopped merge, revert or cherry-pick.
    if (operation) await clearMergeState(ctx);
  }

  await moveHead(ctx, branch, target);
  await logHeadMove(ctx, {
    from: head,
    to: target,
    message: `reset: moving to ${options.commit ?? "HEAD"}`,
    branch,
  });

  const output =
    mode === "hard"
      ? `HEAD is now at ${await describeCommit(ctx, target)}`
      : mode === "mixed"
        ? await unstagedReport(ctx)
        : "";
  return success(output, { mode, from: head, to: target, paths: [] });
}
