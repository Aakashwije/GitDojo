import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { formatDiffStat } from "../engine/diff";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  DEFAULT_AUTHOR,
  type ConflictKind,
  type GitAbortMergeResult,
  type GitMergeOptions,
  type GitMergeResult,
} from "../engine/git-engine";
import {
  clearMergeState,
  operationInProgressMessage,
  operationKind,
  readMergeState,
  writeMergeState,
  type MergeConflictRecord,
} from "../engine/merge-state";
import { logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  isRepository,
  moveHead,
  resolveRefOrNull,
  shortOid,
} from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";
import { threeWay, threeWayOverwriteError } from "../engine/three-way";
import {
  applyWorkingTreeUpdates,
  overwriteError,
  readBlob,
  readBlobText,
  readTreeFiles,
  updatesFromTree,
} from "../engine/working-tree";
import { isValidBranchName } from "./branch";

export const MERGE_USAGE =
  "usage: git merge [--no-ff | --ff-only] <branch>\n   or: git merge --abort";

export function conflictKind(
  conflict: Pick<MergeConflictRecord, "base" | "ours" | "theirs">,
): ConflictKind {
  if (conflict.ours === null) return "deleted by us";
  if (conflict.theirs === null) return "deleted by them";
  return conflict.base === null ? "both added" : "both modified";
}

async function textOf(ctx: GitContext, oid: string | undefined): Promise<string | null> {
  return oid === undefined ? null : readBlobText(ctx, oid);
}

function mergeMessage(name: string, into: string | null): string {
  return into === null || into === "main" || into === "master"
    ? `Merge branch '${name}'`
    : `Merge branch '${name}' into ${into}`;
}

/** `git merge <branch>`. */
export async function runMerge(
  ctx: GitContext,
  name: string,
  options: GitMergeOptions = {},
): Promise<GitMergeResult> {
  if (name === "") {
    return failure(gitError("INVALID_ARGUMENT", `fatal: no branch to merge\n${MERGE_USAGE}`));
  }
  if (!(await isRepository(ctx))) return notARepository();
  const inProgress = await readMergeState(ctx);
  if (inProgress) {
    return failure(gitError("MERGE_IN_PROGRESS", operationInProgressMessage(inProgress)));
  }

  const theirs = isValidBranchName(name) ? await resolveRefOrNull(ctx, `refs/heads/${name}`) : null;
  if (theirs === null) {
    return failure(gitError("BRANCH_NOT_FOUND", `merge: ${name} - not something we can merge`));
  }

  const branch = await currentBranch(ctx);
  const ours = await resolveRefOrNull(ctx, "HEAD");
  if (
    ours !== null &&
    (ours === theirs ||
      (await git.isDescendent({
        fs: ctx.fs,
        dir: ctx.dir,
        oid: ours,
        ancestor: theirs,
        depth: -1,
      })))
  ) {
    return success("Already up to date.", { type: "up-to-date", oid: ours });
  }

  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  const bases =
    ours === null
      ? []
      : ((await git.findMergeBase({ fs: ctx.fs, dir: ctx.dir, oids: [ours, theirs] })) as string[]);
  const base = bases[0] ?? null;

  if (options.fastForwardOnly && base !== ours) {
    return failure(gitError("NOT_FAST_FORWARD", "fatal: Not possible to fast-forward, aborting."));
  }

  const [baseTree, oursTree, theirsTree] = await Promise.all([
    readTreeFiles(ctx, base),
    readTreeFiles(ctx, ours),
    readTreeFiles(ctx, theirs),
  ]);

  // Fast-forward: the current branch has nothing of its own, so it simply moves up to theirs.
  if (base === ours && !options.noFastForward) {
    const paths = [...new Set([...oursTree.keys(), ...theirsTree.keys()])]
      .filter((path) => oursTree.get(path) !== theirsTree.get(path))
      .sort((a, b) => a.localeCompare(b));
    const problem = overwriteError("merge", paths, status, (path) => theirsTree.has(path));
    if (problem) return failure(problem);

    const changes = await Promise.all(
      paths.map(async (path) => ({
        path,
        before: await textOf(ctx, oursTree.get(path)),
        after: await textOf(ctx, theirsTree.get(path)),
      })),
    );
    await applyWorkingTreeUpdates(
      ctx,
      await updatesFromTree(paths, theirsTree, (oid) => readBlob(ctx, oid)),
    );
    await moveHead(ctx, branch, theirs);
    await logHeadMove(ctx, {
      from: ours,
      to: theirs,
      message: `merge ${name}: Fast-forward`,
      branch,
    });
    const range = ours === null ? shortOid(theirs) : `${shortOid(ours)}..${shortOid(theirs)}`;
    return success([`Updating ${range}`, "Fast-forward", ...formatDiffStat(changes)].join("\n"), {
      type: "fast-forward",
      oid: theirs,
    });
  }

  // Three-way merge: take each side's changes relative to the merge base.
  const merged = await threeWay(ctx, {
    base: baseTree,
    ours: oursTree,
    theirs: theirsTree,
    labels: { ours: "HEAD", theirs: name },
  });
  const problem = threeWayOverwriteError("merge", merged, status);
  if (problem) return failure(problem);
  await applyWorkingTreeUpdates(ctx, merged.updates);

  const message = mergeMessage(name, branch);
  if (merged.conflicts.length > 0) {
    await writeMergeState(ctx, {
      kind: "merge",
      branch: name,
      theirs,
      ours: ours ?? theirs,
      message,
      conflicts: merged.conflicts,
      touched: merged.updates.map((update) => update.path),
    });
    const output = [
      ...merged.report,
      "Automatic merge failed; fix conflicts and then commit the result.",
    ].join("\n");
    return {
      ok: false,
      output,
      data: { type: "conflict", conflicts: merged.conflicts.map((conflict) => conflict.path) },
      error: gitError("MERGE_CONFLICT", output),
    };
  }

  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author: DEFAULT_AUTHOR,
    parent: ours === null ? [theirs] : [ours, theirs],
  });
  await logHeadMove(ctx, {
    from: ours,
    to: oid,
    message: `merge ${name}: Merge made by the 'ort' strategy.`,
    branch,
  });
  return success(
    [...merged.report, "Merge made by the 'ort' strategy.", ...formatDiffStat(merged.changes)].join(
      "\n",
    ),
    { type: "merge-commit", oid },
  );
}

/**
 * Puts every path a stopped operation touched back to HEAD's version and forgets the operation.
 * Shared by `git merge --abort`, `git revert --abort` and `git cherry-pick --abort`.
 */
export async function undoTouchedPaths(ctx: GitContext, touched: readonly string[]): Promise<void> {
  const head = await readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD"));
  await applyWorkingTreeUpdates(
    ctx,
    await updatesFromTree(touched, head, (oid) => readBlob(ctx, oid)),
  );
  await clearMergeState(ctx);
}

/** `git merge --abort`: puts every path the merge touched back to HEAD's version. */
export async function runAbortMerge(ctx: GitContext): Promise<GitAbortMergeResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const state = await readMergeState(ctx);
  if (!state || operationKind(state) !== "merge") {
    return failure(gitError("NO_MERGE", "fatal: There is no merge to abort (MERGE_HEAD missing)."));
  }
  await undoTouchedPaths(ctx, state.touched);
  // Real `git merge --abort` is silent on success.
  return success("", { restoredPaths: state.touched });
}
