import git from "isomorphic-git";
import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";
import { type GitStashEntry } from "./git-engine";

/** One path saved in a stash entry. Contents are `null` where the file did not exist. */
export interface StashedFile {
  path: string;
  /** The staged content when stashed. */
  index: string | null;
  /** The working-tree content when stashed. */
  worktree: string | null;
  /** The file was new: staged for the first time, or untracked (with `-u`). */
  added: boolean;
  untracked: boolean;
}

/**
 * A `git stash` entry. Git stores these as special commits on `refs/stash`; GitDojo keeps them as
 * plain records in `.git/GITDOJO_STASH.json` (lesson files are small text files), which keeps
 * stash behaviour simple and deterministic.
 */
export interface StashRecord {
  oid: string;
  /** `WIP on main: abc1234 Subject` or `On main: <message>`. */
  message: string;
  branch: string | null;
  /** HEAD when the work was stashed. */
  base: string;
  timestamp: number;
  files: StashedFile[];
}

const FILE = "GITDOJO_STASH.json";

function path(ctx: GitContext): string {
  return `${ctx.dir}/.git/${FILE}`;
}

/** Newest first: index 0 is `stash@{0}`. */
export async function readStashes(ctx: GitContext): Promise<StashRecord[]> {
  try {
    const raw = await ctx.fs.promises.readFile(path(ctx), { encoding: "utf8" });
    return JSON.parse(
      typeof raw === "string" ? raw : new TextDecoder().decode(raw),
    ) as StashRecord[];
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
}

export async function writeStashes(ctx: GitContext, stashes: StashRecord[]): Promise<void> {
  if (stashes.length === 0) {
    try {
      await ctx.fs.promises.unlink(path(ctx));
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }
    return;
  }
  await ctx.fs.promises.writeFile(path(ctx), JSON.stringify(stashes), "utf8");
}

/** A stable, Git-looking id for an entry (Git's would be the stash commit's oid). */
export async function stashOid(record: Omit<StashRecord, "oid">): Promise<string> {
  const { oid } = await git.hashBlob({
    object: new TextEncoder().encode(JSON.stringify(record)),
  });
  return oid;
}

export function toStashEntry(record: StashRecord, index: number): GitStashEntry {
  return {
    index,
    message: record.message,
    branch: record.branch,
    oid: record.oid,
    paths: record.files.map((file) => file.path),
  };
}

/**
 * Which entry `stash@{n}`, `n` or nothing (the newest) names; `null` when it is not a valid
 * reference. Git also accepts a bare number.
 */
export function stashIndex(reference: string | undefined): number | null {
  if (reference === undefined || reference === "") return 0;
  const match = /^(?:stash@\{(\d+)\}|(\d+))$/.exec(reference.trim());
  if (!match) return null;
  return Number(match[1] ?? match[2]);
}
