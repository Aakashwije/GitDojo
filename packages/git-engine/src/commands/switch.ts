import git from "isomorphic-git";
import { ensureDirectory, pathExists } from "../filesystem/fs-helpers";
import { parentPath } from "../filesystem/paths";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitStatusEntry, type GitSwitchResult } from "../engine/git-engine";
import { currentBranch, isRepository, resolveRefOrNull } from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";
import { newBranchNameError } from "./branch";

export const MISSING_BRANCH_ARGUMENT = "fatal: missing branch or commit argument";

/** A path whose committed content differs between the current commit and the target commit. */
interface TreeChange {
  path: string;
  /** Blob in the target commit, or `null` when the target does not have the path. */
  to: string | null;
}

/** Blob oid for every file in a commit's tree. */
async function readTreeFiles(ctx: GitContext, commit: string | null): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  if (commit === null) return files;
  await git.walk({
    fs: ctx.fs,
    dir: ctx.dir,
    trees: [git.TREE({ ref: commit })],
    map: async (path, [entry]) => {
      if (path !== "." && entry && (await entry.type()) === "blob") {
        files.set(path, await entry.oid());
      }
      // Returning undefined (not null) keeps descending into subdirectories.
      return undefined;
    },
  });
  return files;
}

async function diffCommits(
  ctx: GitContext,
  from: string | null,
  to: string | null,
): Promise<TreeChange[]> {
  const [before, after] = await Promise.all([readTreeFiles(ctx, from), readTreeFiles(ctx, to)]);
  const changes: TreeChange[] = [];
  for (const [path, oid] of before) {
    if (after.get(path) !== oid) changes.push({ path, to: after.get(path) ?? null });
  }
  for (const [path, oid] of after) {
    if (!before.has(path)) changes.push({ path, to: oid });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

function hasLocalChange(entry: GitStatusEntry | undefined): boolean {
  return (
    entry !== undefined &&
    (entry.staged !== null || entry.unstaged === "modified" || entry.unstaged === "deleted")
  );
}

function conflictError(heading: string, paths: string[], advice: string) {
  return failure<never>(
    gitError(
      "CHECKOUT_CONFLICT",
      [heading, ...paths.map((path) => `\t${path}`), advice, "Aborting"].join("\n"),
    ),
  );
}

/** Deletes empty directories from `path` upwards, stopping at the workspace root. */
async function pruneEmptyDirectories(ctx: GitContext, path: string): Promise<void> {
  for (let dir = path; dir !== ""; dir = parentPath(dir)) {
    const absolute = `${ctx.dir}/${dir}`;
    if ((await ctx.fs.promises.readdir(absolute)).length > 0) return;
    await ctx.fs.promises.rmdir(absolute);
  }
}

/**
 * Makes the working tree and index match the target commit for the paths that differ between the
 * two commits. Everything else, including uncommitted work, is carried over untouched, as in Git.
 */
async function applyChanges(ctx: GitContext, changes: TreeChange[]): Promise<void> {
  // Removals first, so a file can be replaced by a directory of the same name (and vice versa).
  for (const change of changes.filter((c) => c.to === null)) {
    const absolute = `${ctx.dir}/${change.path}`;
    if (await pathExists(ctx.fs.promises, absolute)) await ctx.fs.promises.unlink(absolute);
    await git.remove({ fs: ctx.fs, dir: ctx.dir, filepath: change.path });
    await pruneEmptyDirectories(ctx, parentPath(change.path));
  }
  for (const change of changes) {
    if (change.to === null) continue;
    const { blob } = await git.readBlob({ fs: ctx.fs, dir: ctx.dir, oid: change.to });
    const absolute = `${ctx.dir}/${change.path}`;
    await ensureDirectory(ctx.fs.promises, `${ctx.dir}/${parentPath(change.path)}`);
    // Replace rather than overwrite so Git's stat check sees the change (see WorkspaceFileSystem).
    if (await pathExists(ctx.fs.promises, absolute)) await ctx.fs.promises.unlink(absolute);
    await ctx.fs.promises.writeFile(absolute, blob);
    await git.add({ fs: ctx.fs, dir: ctx.dir, filepath: change.path });
  }
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

  const changes = await diffCommits(ctx, await resolveRefOrNull(ctx, "HEAD"), target);
  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));

  // Refuse, like Git, instead of silently overwriting the learner's work.
  const overwritten = changes.filter((change) => hasLocalChange(status.get(change.path)));
  if (overwritten.length > 0) {
    return conflictError(
      "error: Your local changes to the following files would be overwritten by checkout:",
      overwritten.map((change) => change.path),
      "Please commit your changes or stash them before you switch branches.",
    );
  }
  const untracked = changes.filter(
    (change) => change.to !== null && status.get(change.path)?.unstaged === "untracked",
  );
  if (untracked.length > 0) {
    return conflictError(
      "error: The following untracked working tree files would be overwritten by checkout:",
      untracked.map((change) => change.path),
      "Please move or remove them before you switch branches.",
    );
  }

  await applyChanges(ctx, changes);
  await attachHead(ctx, name);
  return success(`Switched to branch '${name}'`, {
    branch: name,
    switched: true,
    created: false,
    updatedPaths: changes.map((change) => change.path),
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
  return create ? createAndSwitch(ctx, name) : switchToExisting(ctx, name);
}
