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
  const entries = await git.log({ fs: ctx.fs, dir: ctx.dir, ref: "HEAD" });
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
