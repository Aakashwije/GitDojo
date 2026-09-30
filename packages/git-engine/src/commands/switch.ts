import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitSwitchResult } from "../engine/git-engine";
import { readMergeState } from "../engine/merge-state";
import { currentBranch, isRepository, resolveRefOrNull } from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";
import {
  applyWorkingTreeUpdates,
  overwriteError,
  readBlob,
  readTreeFiles,
  updatesFromTree,
} from "../engine/working-tree";
import { newBranchNameError } from "./branch";

export const MISSING_BRANCH_ARGUMENT = "fatal: missing branch or commit argument";

/** Paths whose committed content differs between two commits. */
async function changedPaths(
  ctx: GitContext,
  from: string | null,
  to: string | null,
): Promise<{ paths: string[]; target: Map<string, string> }> {
  const [before, after] = await Promise.all([readTreeFiles(ctx, from), readTreeFiles(ctx, to)]);
  const paths = new Set<string>();
  for (const [path, oid] of before) if (after.get(path) !== oid) paths.add(path);
  for (const path of after.keys()) if (!before.has(path)) paths.add(path);
  return { paths: [...paths].sort((a, b) => a.localeCompare(b)), target: after };
}

async function attachHead(ctx: GitContext, branch: string): Promise<void> {
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: "HEAD",
    value: `refs/heads/${branch}`,
    symbolic: true,
    force: true,
  });
}

async function createAndSwitch(ctx: GitContext, name: string): Promise<GitSwitchResult> {
  const nameError = await newBranchNameError(ctx, name);
  if (nameError) return failure(nameError);

  const head = await resolveRefOrNull(ctx, "HEAD");
  // On an unborn branch there is nothing to point at yet: Git simply renames the future branch.
  if (head !== null) await git.branch({ fs: ctx.fs, dir: ctx.dir, ref: name, object: head });
  // The new branch points at the current commit, so the working tree and index stay as they are.
  await attachHead(ctx, name);
  return success(`Switched to a new branch '${name}'`, {
    branch: name,
    switched: true,
    created: true,
    updatedPaths: [],
  });
}

async function switchToExisting(ctx: GitContext, name: string): Promise<GitSwitchResult> {
  const target = await resolveRefOrNull(ctx, `refs/heads/${name}`);
  if (target === null) {
    return failure(gitError("BRANCH_NOT_FOUND", `fatal: invalid reference: ${name}`));
  }
  if ((await currentBranch(ctx)) === name) {
    return success(`Already on '${name}'`, {
      branch: name,
      switched: false,
      created: false,
      updatedPaths: [],
    });
  }

  const { paths, target: tree } = await changedPaths(
    ctx,
    await resolveRefOrNull(ctx, "HEAD"),
    target,
  );
  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  // Refuse, like Git, instead of silently overwriting the learner's work.
  const problem = overwriteError("checkout", paths, status, (path) => tree.has(path));
  if (problem) return failure(problem);

  await applyWorkingTreeUpdates(
    ctx,
    await updatesFromTree(paths, tree, (oid) => readBlob(ctx, oid)),
  );
  await attachHead(ctx, name);
  return success(`Switched to branch '${name}'`, {
    branch: name,
    switched: true,
    created: false,
    updatedPaths: paths,
  });
}

/** `git switch <name>` and `git switch -c <name>`. */
export async function runSwitch(
  ctx: GitContext,
  name: string,
  { create }: { create: boolean },
): Promise<GitSwitchResult> {
  if (name === "") return failure(gitError("INVALID_ARGUMENT", MISSING_BRANCH_ARGUMENT));
  if (!(await isRepository(ctx))) return notARepository();
  if (await readMergeState(ctx)) {
    return failure(
      gitError(
        "MERGE_IN_PROGRESS",
        "error: you need to resolve your current index first\nhint: Finish the merge with 'git commit', or cancel it with 'git merge --abort'.",
      ),
    );
  }
  return create ? createAndSwitch(ctx, name) : switchToExisting(ctx, name);
}
