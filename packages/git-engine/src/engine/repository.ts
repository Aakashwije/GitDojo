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

/**
 * Commits already read during one operation (such as a snapshot), by oid, so histories shared by
 * several branches are read once instead of once per branch.
 */
export type CommitCache = Map<string, CachedCommit>;

interface CachedCommit {
  info: GitCommitInfo;
  committerTimestamp: number;
}

export function createCommitCache(): CommitCache {
  return new Map();
}

async function readCachedCommit(
  ctx: GitContext,
  oid: string,
  cache: CommitCache,
): Promise<CachedCommit> {
  const cached = cache.get(oid);
  if (cached) return cached;
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
  const entry: CachedCommit = {
    info: {
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
    },
    committerTimestamp: commit.committer.timestamp,
  };
  cache.set(oid, entry);
  return entry;
}

export async function readCommitsFromHead(
  ctx: GitContext,
  cache: CommitCache = createCommitCache(),
): Promise<GitCommitInfo[]> {
  return readCommits(ctx, "HEAD", cache);
}

/**
 * The history behind `ref`, in exactly the order isomorphic-git's `log` produces (newest
 * committer date first), but reading commits through `cache`.
 */
async function readCommits(
  ctx: GitContext,
  ref: string,
  cache: CommitCache = createCommitCache(),
): Promise<GitCommitInfo[]> {
  const oid = await git.resolveRef({ fs: ctx.fs, dir: ctx.dir, ref });
  const tips = [await readCachedCommit(ctx, oid, cache)];
  const commits: GitCommitInfo[] = [];
  while (tips.length > 0) {
    const commit = tips.pop();
    if (commit === undefined) break;
    commits.push(commit.info);
    for (const parent of commit.info.parents) {
      const entry = await readCachedCommit(ctx, parent, cache);
      if (!tips.some((tip) => tip.info.oid === entry.info.oid)) tips.push(entry);
    }
    tips.sort((a, b) => a.committerTimestamp - b.committerTimestamp);
  }
  return commits;
}

/**
 * Every commit reachable from any of `tips`, children before parents. Ties (commits made in the
 * same second, common in lesson setup) are broken by first appearance, which keeps each branch's
 * own history in order.
 */
export async function readCommitsFrom(
  ctx: GitContext,
  tips: readonly string[],
  cache: CommitCache = createCommitCache(),
): Promise<GitCommitInfo[]> {
  const byOid = new Map<string, GitCommitInfo>();
  for (const tip of new Set(tips)) {
    for (const commit of await readCommits(ctx, tip, cache)) {
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

/** True when `ancestor` is `oid` itself or one of its ancestors. */
export async function isAncestor(ctx: GitContext, ancestor: string, oid: string): Promise<boolean> {
  if (ancestor === oid) return true;
  return git.isDescendent({ fs: ctx.fs, dir: ctx.dir, oid, ancestor, depth: -1 });
}

/** Every oid reachable from any branch. */
async function reachableFromBranches(ctx: GitContext, cache: CommitCache): Promise<Set<string>> {
  const reached = new Set<string>();
  for (const branch of await git.listBranches({ fs: ctx.fs, dir: ctx.dir })) {
    const tip = await resolveRefOrNull(ctx, `refs/heads/${branch}`);
    if (tip === null || reached.has(tip)) continue;
    for (const commit of await readCommits(ctx, tip, cache)) reached.add(commit.oid);
  }
  return reached;
}

/**
 * Commits reachable from `oid` but from no branch, newest first. When HEAD leaves such a commit
 * (a detached HEAD, or a branch reset away from it) only the reflog still remembers it.
 */
export async function unreachableFromBranches(
  ctx: GitContext,
  oid: string,
): Promise<GitCommitInfo[]> {
  const cache = createCommitCache();
  const reached = await reachableFromBranches(ctx, cache);
  return (await readCommits(ctx, oid, cache)).filter((commit) => !reached.has(commit.oid));
}

export function subject(message: string): string {
  return message.split("\n")[0] ?? "";
}

/** `abc1234 Commit subject`, as Git prints a commit in one line. */
export async function describeCommit(ctx: GitContext, oid: string): Promise<string> {
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
  return `${shortOid(oid)} ${subject(commit.message)}`;
}

/** Points the current branch (or a detached HEAD) at `oid`. HEAD itself stays attached. */
export async function moveHead(ctx: GitContext, branch: string | null, oid: string): Promise<void> {
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: branch === null ? "HEAD" : `refs/heads/${branch}`,
    value: oid,
    force: true,
  });
}
