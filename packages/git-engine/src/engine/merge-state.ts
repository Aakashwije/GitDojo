import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";

/** One conflicted path. Contents are `null` where that side does not have the file. */
export interface MergeConflictRecord {
  path: string;
  base: string | null;
  ours: string | null;
  theirs: string | null;
  resolved: boolean;
}

/**
 * A merge that stopped for conflicts. Git keeps MERGE_HEAD and MERGE_MSG in `.git`; GitDojo writes
 * those too, plus its own record of the conflicts, because conflict stages are not available in
 * isomorphic-git's index.
 */
export interface MergeStateRecord {
  /** Branch name as the learner typed it. */
  branch: string;
  /** MERGE_HEAD: the commit being merged in. */
  theirs: string;
  /** HEAD when the merge started. */
  ours: string;
  message: string;
  conflicts: MergeConflictRecord[];
  /** Every path the merge changed in the working tree, so `git merge --abort` can undo it. */
  touched: string[];
}

const STATE_FILE = "GITDOJO_MERGE.json";

function gitPath(ctx: GitContext, name: string): string {
  return `${ctx.dir}/.git/${name}`;
}

export async function readMergeState(ctx: GitContext): Promise<MergeStateRecord | null> {
  try {
    const raw = await ctx.fs.promises.readFile(gitPath(ctx, STATE_FILE), { encoding: "utf8" });
    return JSON.parse(
      typeof raw === "string" ? raw : new TextDecoder().decode(raw),
    ) as MergeStateRecord;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

export async function writeMergeState(ctx: GitContext, state: MergeStateRecord): Promise<void> {
  await ctx.fs.promises.writeFile(gitPath(ctx, "MERGE_HEAD"), `${state.theirs}\n`, "utf8");
  await ctx.fs.promises.writeFile(gitPath(ctx, "MERGE_MSG"), `${state.message}\n`, "utf8");
  await ctx.fs.promises.writeFile(gitPath(ctx, STATE_FILE), JSON.stringify(state), "utf8");
}

export async function clearMergeState(ctx: GitContext): Promise<void> {
  for (const name of ["MERGE_HEAD", "MERGE_MSG", STATE_FILE]) {
    try {
      await ctx.fs.promises.unlink(gitPath(ctx, name));
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }
  }
}

export function unresolvedConflicts(state: MergeStateRecord | null): MergeConflictRecord[] {
  return state?.conflicts.filter((conflict) => !conflict.resolved) ?? [];
}
