import { type GitEngineError } from "@gitdojo/shared-types";
import git from "isomorphic-git";
import { ensureDirectory, pathExists, replaceFile } from "../filesystem/fs-helpers";
import { parentPath } from "../filesystem/paths";
import { type GitContext } from "./context";
import { gitError } from "./errors";
import { type GitStatusEntry } from "./git-engine";

/** Blob oid for every file in a commit's tree. Empty for `null` (an unborn branch). */
export async function readTreeFiles(
  ctx: GitContext,
  commit: string | null,
): Promise<Map<string, string>> {
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

export async function readBlobText(ctx: GitContext, oid: string): Promise<string> {
  const { blob } = await git.readBlob({ fs: ctx.fs, dir: ctx.dir, oid });
  return new TextDecoder().decode(blob);
}

export async function readWorkingText(ctx: GitContext, path: string): Promise<string | null> {
  const absolute = `${ctx.dir}/${path}`;
  if (!(await pathExists(ctx.fs.promises, absolute))) return null;
  const content = await ctx.fs.promises.readFile(absolute, { encoding: "utf8" });
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

/** Deletes empty directories from `path` upwards, stopping at the workspace root. */
async function pruneEmptyDirectories(ctx: GitContext, path: string): Promise<void> {
  for (let dir = path; dir !== ""; dir = parentPath(dir)) {
    const absolute = `${ctx.dir}/${dir}`;
    if ((await ctx.fs.promises.readdir(absolute)).length > 0) return;
    await ctx.fs.promises.rmdir(absolute);
  }
}

/** Target content for one working-tree path: text or a blob, or `null` to delete it. */
export interface WorkingTreeUpdate {
  path: string;
  content: string | Uint8Array | null;
  /** Also record the new content in the index (default true). */
  stage?: boolean;
}

/**
 * Writes or deletes working-tree files and, unless told otherwise, updates the index to match.
 * Deletions run first, so a file can be replaced by a directory of the same name and vice versa.
 */
export async function applyWorkingTreeUpdates(
  ctx: GitContext,
  updates: readonly WorkingTreeUpdate[],
): Promise<void> {
  for (const update of updates.filter((u) => u.content === null)) {
    const absolute = `${ctx.dir}/${update.path}`;
    if (await pathExists(ctx.fs.promises, absolute)) await ctx.fs.promises.unlink(absolute);
    if (update.stage !== false) {
      await git.remove({ fs: ctx.fs, dir: ctx.dir, filepath: update.path });
    }
    await pruneEmptyDirectories(ctx, parentPath(update.path));
  }
  for (const update of updates) {
    if (update.content === null) continue;
    const absolute = `${ctx.dir}/${update.path}`;
    await ensureDirectory(ctx.fs.promises, `${ctx.dir}/${parentPath(update.path)}`);
    // A fresh inode, so Git's stat check always sees the change.
    await replaceFile(ctx.fs.promises, absolute, update.content);
    if (update.stage !== false) await git.add({ fs: ctx.fs, dir: ctx.dir, filepath: update.path });
  }
}

/** Updates that make `paths` match their blobs in `tree` (deleting paths the tree lacks). */
export function updatesFromTree(
  paths: Iterable<string>,
  tree: ReadonlyMap<string, string>,
  readBlob: (oid: string) => Promise<Uint8Array>,
): Promise<WorkingTreeUpdate[]> {
  return Promise.all(
    [...paths].map(async (path) => {
      const oid = tree.get(path);
      return { path, content: oid === undefined ? null : await readBlob(oid) };
    }),
  );
}

export async function readBlob(ctx: GitContext, oid: string): Promise<Uint8Array> {
  return (await git.readBlob({ fs: ctx.fs, dir: ctx.dir, oid })).blob;
}

export function hasLocalChange(entry: GitStatusEntry | undefined): boolean {
  return (
    entry !== undefined &&
    (entry.staged !== null || entry.unstaged === "modified" || entry.unstaged === "deleted")
  );
}

/**
 * Git refuses to switch branches or merge when that would overwrite uncommitted work. Returns
 * Git's error for the first kind of problem found among `paths`, or `null` when it is safe.
 *
 * `creates` tells whether the operation will write a file at a path (so an untracked file there
 * would be lost).
 */
export function overwriteError(
  operation: "checkout" | "merge",
  paths: readonly string[],
  status: ReadonlyMap<string, GitStatusEntry>,
  creates: (path: string) => boolean,
): GitEngineError | null {
  const advice =
    operation === "checkout"
      ? "Please commit your changes or stash them before you switch branches."
      : "Please commit your changes or stash them before you merge.";
  const report = (heading: string, found: string[], tail: string) =>
    gitError(
      "CHECKOUT_CONFLICT",
      [heading, ...found.map((path) => `\t${path}`), tail, "Aborting"].join("\n"),
    );

  const modified = paths.filter((path) => hasLocalChange(status.get(path)));
  if (modified.length > 0) {
    return report(
      `error: Your local changes to the following files would be overwritten by ${operation}:`,
      modified,
      advice,
    );
  }
  const untracked = paths.filter(
    (path) => creates(path) && status.get(path)?.unstaged === "untracked",
  );
  if (untracked.length > 0) {
    return report(
      `error: The following untracked working tree files would be overwritten by ${operation}:`,
      untracked,
      `Please move or remove them before you ${operation === "checkout" ? "switch branches" : "merge"}.`,
    );
  }
  return null;
}
