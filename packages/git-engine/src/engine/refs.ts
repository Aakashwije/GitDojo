import git from "isomorphic-git";
import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";
import { type GitRemoteTrackingInfo, type GitTagInfo, type GitUpstreamInfo } from "./git-engine";
import {
  createCommitCache,
  readCommitsFrom,
  resolveRefOrNull,
  type CommitCache,
} from "./repository";

/** Whether `oid` is a commit, an annotated tag, or anything else (`null`). */
async function objectKind(ctx: GitContext, oid: string): Promise<"commit" | "tag" | null> {
  const ignorable = (error: unknown) =>
    hasErrorCode(error, "NotFoundError") || hasErrorCode(error, "ObjectTypeError");
  // Tags first: isomorphic-git's readCommit quietly peels a tag to its commit.
  try {
    await git.readTag({ fs: ctx.fs, dir: ctx.dir, oid });
    return "tag";
  } catch (error) {
    if (!ignorable(error)) throw error;
  }
  try {
    await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
    return "commit";
  } catch (error) {
    if (!ignorable(error)) throw error;
    return null;
  }
}

/**
 * Follows annotated tags to the commit they name. Returns `oid` itself for a commit, and `null`
 * when it names no object (or a tree or blob).
 */
export async function peelToCommit(ctx: GitContext, oid: string): Promise<string | null> {
  let current = oid;
  // Tags can point at tags; Git peels any number of them.
  for (let depth = 0; depth < 10; depth += 1) {
    const type = await objectKind(ctx, current);
    if (type === "commit") return current;
    if (type !== "tag") return null;
    current = (await git.readTag({ fs: ctx.fs, dir: ctx.dir, oid: current })).tag.object;
  }
  return null;
}

/** The commit a ref names, peeling annotated tags; `null` when the ref does not exist. */
export async function resolveCommitRef(ctx: GitContext, ref: string): Promise<string | null> {
  const oid = await resolveRefOrNull(ctx, ref);
  return oid === null ? null : peelToCommit(ctx, oid);
}

/** Every tag, sorted by name, peeled to its commit. */
export async function readTags(ctx: GitContext): Promise<GitTagInfo[]> {
  const names = (await git.listTags({ fs: ctx.fs, dir: ctx.dir })).sort();
  const tags: GitTagInfo[] = [];
  for (const name of names) {
    const oid = await resolveRefOrNull(ctx, `refs/tags/${name}`);
    if (oid === null) continue;
    const type = await objectKind(ctx, oid);
    if (type === "tag") {
      const { tag } = await git.readTag({ fs: ctx.fs, dir: ctx.dir, oid });
      const target = await peelToCommit(ctx, tag.object);
      if (target === null) continue;
      tags.push({ name, oid: target, annotated: true, message: tag.message.trimEnd() });
    } else if (type === "commit") {
      tags.push({ name, oid, annotated: false });
    }
  }
  return tags;
}

/** `refs/remotes/<remote>/<branch>` for every remote-tracking branch, sorted by name. */
export async function readRemoteTrackingBranches(
  ctx: GitContext,
): Promise<GitRemoteTrackingInfo[]> {
  const remotes = (await git.listRemotes({ fs: ctx.fs, dir: ctx.dir })).map((r) => r.remote);
  const branches: GitRemoteTrackingInfo[] = [];
  for (const remote of remotes) {
    const names = await git.listBranches({ fs: ctx.fs, dir: ctx.dir, remote });
    for (const branch of names) {
      if (branch === "HEAD") continue;
      const oid = await resolveRefOrNull(ctx, `refs/remotes/${remote}/${branch}`);
      if (oid !== null) branches.push({ name: `${remote}/${branch}`, remote, branch, oid });
    }
  }
  return branches.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

async function readConfig(ctx: GitContext, path: string): Promise<string | null> {
  const value: unknown = await git.getConfig({ fs: ctx.fs, dir: ctx.dir, path });
  return typeof value === "string" && value !== "" ? value : null;
}

/** `branch.<name>.remote` / `branch.<name>.merge`, as `{ remote: "origin", branch: "main" }`. */
export async function readUpstreamConfig(
  ctx: GitContext,
  branch: string,
): Promise<{ remote: string; branch: string } | null> {
  const [remote, merge] = await Promise.all([
    readConfig(ctx, `branch.${branch}.remote`),
    readConfig(ctx, `branch.${branch}.merge`),
  ]);
  if (remote === null || merge === null || !merge.startsWith("refs/heads/")) return null;
  return { remote, branch: merge.slice("refs/heads/".length) };
}

/** Makes `remote/remoteBranch` the upstream of `branch`, as `git push -u` does. */
export async function writeUpstreamConfig(
  ctx: GitContext,
  branch: string,
  remote: string,
  remoteBranch: string,
): Promise<void> {
  await git.setConfig({ fs: ctx.fs, dir: ctx.dir, path: `branch.${branch}.remote`, value: remote });
  await git.setConfig({
    fs: ctx.fs,
    dir: ctx.dir,
    path: `branch.${branch}.merge`,
    value: `refs/heads/${remoteBranch}`,
  });
}

/** Forgets a branch's upstream, e.g. when the branch is deleted. */
export async function clearUpstreamConfig(ctx: GitContext, branch: string): Promise<void> {
  for (const key of ["remote", "merge"]) {
    await git.setConfig({
      fs: ctx.fs,
      dir: ctx.dir,
      path: `branch.${branch}.${key}`,
      value: undefined,
    });
  }
}

/** Commits on `a` that `b` does not have, and the other way round. */
export async function aheadBehind(
  ctx: GitContext,
  a: string,
  b: string,
  cache: CommitCache = createCommitCache(),
): Promise<{ ahead: number; behind: number }> {
  if (a === b) return { ahead: 0, behind: 0 };
  const [ours, theirs] = await Promise.all([
    readCommitsFrom(ctx, [a], cache),
    readCommitsFrom(ctx, [b], cache),
  ]);
  const ourOids = new Set(ours.map((commit) => commit.oid));
  const theirOids = new Set(theirs.map((commit) => commit.oid));
  return {
    ahead: ours.filter((commit) => !theirOids.has(commit.oid)).length,
    behind: theirs.filter((commit) => !ourOids.has(commit.oid)).length,
  };
}

/** How `branch` (at `oid`) compares with its upstream, or `undefined` when it has none. */
export async function upstreamInfo(
  ctx: GitContext,
  branch: string,
  oid: string | null,
  cache?: CommitCache,
): Promise<GitUpstreamInfo | undefined> {
  const upstream = await readUpstreamConfig(ctx, branch);
  if (upstream === null) return undefined;
  const name = `${upstream.remote}/${upstream.branch}`;
  const tracking = await resolveRefOrNull(ctx, `refs/remotes/${name}`);
  if (tracking === null) return { name, ahead: 0, behind: 0, gone: true };
  if (oid === null) return { name, ahead: 0, behind: 0, gone: false };
  return { name, ...(await aheadBehind(ctx, oid, tracking, cache)), gone: false };
}
