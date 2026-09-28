import git from "isomorphic-git";
import { hasErrorCode } from "../filesystem/fs-errors";
import { pathExists } from "../filesystem/fs-helpers";
import { type GitContext } from "./context";
import { type GitCommitInfo } from "./git-engine";

export async function isRepository(ctx: GitContext): Promise<boolean> {
  return pathExists(ctx.fs.promises, `${ctx.dir}/.git/HEAD`);
}

export async function currentBranch(ctx: GitContext): Promise<string | null> {
  return (await git.currentBranch({ fs: ctx.fs, dir: ctx.dir, fullname: false })) ?? null;
}

/** Resolves a ref to an oid, or `null` when it does not exist yet (e.g. an unborn branch). */
export async function resolveRefOrNull(ctx: GitContext, ref: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs: ctx.fs, dir: ctx.dir, ref });
  } catch (error) {
    if (hasErrorCode(error, "NotFoundError")) return null;
    throw error;
  }
}

export function shortOid(oid: string): string {
  return oid.slice(0, 7);
}

export async function readCommitsFromHead(ctx: GitContext): Promise<GitCommitInfo[]> {
  return readCommits(ctx, "HEAD");
}

async function readCommits(ctx: GitContext, ref: string): Promise<GitCommitInfo[]> {
  const entries = await git.log({ fs: ctx.fs, dir: ctx.dir, ref });
  return entries.map(({ oid, commit }) => ({
    oid,
    shortOid: shortOid(oid),
    message: commit.message.trimEnd(),
    author: {
      name: commit.author.name,
      email: commit.author.email,
      timestamp: commit.author.timestamp,
      timezoneOffset: commit.author.timezoneOffset,
    },
    parents: commit.parent,
  }));
}

/**
 * Every commit reachable from any of `tips`, children before parents. Ties (commits made in the
 * same second, common in lesson setup) are broken by first appearance, which keeps each branch's
 * own history in order.
 */
export async function readCommitsFrom(
  ctx: GitContext,
  tips: readonly string[],
): Promise<GitCommitInfo[]> {
  const byOid = new Map<string, GitCommitInfo>();
  for (const tip of new Set(tips)) {
    for (const commit of await readCommits(ctx, tip)) {
      if (!byOid.has(commit.oid)) byOid.set(commit.oid, commit);
    }
  }
  return topologicalOrder([...byOid.values()]);
}

/** Kahn's algorithm: a commit is emitted only after all of its children, newest first. */
export function topologicalOrder(commits: readonly GitCommitInfo[]): GitCommitInfo[] {
  const position = new Map(commits.map((commit, index) => [commit.oid, index]));
  const childCount = new Map(commits.map((commit) => [commit.oid, 0]));
  for (const commit of commits) {
    for (const parent of commit.parents) {
      const count = childCount.get(parent);
      if (count !== undefined) childCount.set(parent, count + 1);
    }
  }

  const ready = commits.filter((commit) => childCount.get(commit.oid) === 0);
  const ordered: GitCommitInfo[] = [];
  while (ready.length > 0) {
    ready.sort(
      (a, b) =>
        b.author.timestamp - a.author.timestamp ||
        (position.get(a.oid) ?? 0) - (position.get(b.oid) ?? 0),
    );
    const next = ready.shift();
    if (next === undefined) break;
    ordered.push(next);
    for (const parent of next.parents) {
      const count = childCount.get(parent);
      if (count === undefined) continue;
      childCount.set(parent, count - 1);
      if (count === 1) {
        const commit = commits[position.get(parent) ?? -1];
        if (commit) ready.push(commit);
      }
    }
  }
  return ordered;
}
