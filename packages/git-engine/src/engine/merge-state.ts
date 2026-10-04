import { hasErrorCode } from "../filesystem/fs-errors";
import { type GitContext } from "./context";
import { type GitOperationKind } from "./git-engine";

/** One conflicted path. Contents are `null` where that side does not have the file. */
export interface MergeConflictRecord {
  path: string;
  base: string | null;
  ours: string | null;
  theirs: string | null;
  resolved: boolean;
}

/** The author of a commit being replayed: cherry-pick and rebase keep the original one. */
export interface AuthorRecord {
  name: string;
  email: string;
  timestamp: number;
  timezoneOffset: number;
}

/** Where a `git rebase` is: the commits still to replay and how to go back. */
export interface RebaseRecord {
  /** The branch being rebased; it moves only when the rebase finishes. */
  branch: string;
  /** The branch's tip before the rebase, for `--abort`. */
  originalHead: string;
  /** The commit the branch is being replayed onto. */
  onto: string;
  /** Commits still to replay, oldest first. */
  todo: string[];
  /** The commit that stopped with conflicts, or `null` once it has been committed. */
  current: string | null;
}

/**
 * An operation that stopped for conflicts: a merge, revert, cherry-pick or rebase step. Git keeps
 * MERGE_HEAD / CHERRY_PICK_HEAD / REVERT_HEAD and MERGE_MSG in `.git`; GitDojo writes those too,
 * plus its own record of the conflicts, because conflict stages are not available in
 * isomorphic-git's index.
 */
export interface MergeStateRecord {
  /** Missing in records written before revert, cherry-pick and rebase existed: a merge. */
  kind?: GitOperationKind;
  /** The incoming side as Git labels it: the branch name for a merge, else `abc1234 (subject)`. */
  branch: string;
  /** The commit being merged in or replayed (MERGE_HEAD, CHERRY_PICK_HEAD, REVERT_HEAD). */
  theirs: string;
  /** HEAD when the operation started. */
  ours: string;
  message: string;
  /** Cherry-picks and rebases keep the original author. */
  author?: AuthorRecord;
  conflicts: MergeConflictRecord[];
  /** Every path the operation changed in the working tree, so `--abort` can undo it. */
  touched: string[];
  rebase?: RebaseRecord;
}

const STATE_FILE = "GITDOJO_MERGE.json";
const HEAD_FILES: Record<GitOperationKind, string | null> = {
  merge: "MERGE_HEAD",
  "cherry-pick": "CHERRY_PICK_HEAD",
  revert: "REVERT_HEAD",
  rebase: null,
};

function gitPath(ctx: GitContext, name: string): string {
  return `${ctx.dir}/.git/${name}`;
}

export function operationKind(state: Pick<MergeStateRecord, "kind">): GitOperationKind {
  return state.kind ?? "merge";
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
  const headFile = HEAD_FILES[operationKind(state)];
  if (headFile !== null) {
    await ctx.fs.promises.writeFile(gitPath(ctx, headFile), `${state.theirs}\n`, "utf8");
  }
  await ctx.fs.promises.writeFile(gitPath(ctx, "MERGE_MSG"), `${state.message}\n`, "utf8");
  await ctx.fs.promises.writeFile(gitPath(ctx, STATE_FILE), JSON.stringify(state), "utf8");
}

export async function clearMergeState(ctx: GitContext): Promise<void> {
  const files = [...Object.values(HEAD_FILES).filter((f) => f !== null), "MERGE_MSG", STATE_FILE];
  for (const name of files) {
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

/**
 * Git's refusal when another command needs the operation in progress finished first, e.g.
 * `git switch` during a cherry-pick.
 */
export function operationInProgressMessage(state: MergeStateRecord): string {
  switch (operationKind(state)) {
    case "merge":
      return "fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.";
    case "cherry-pick":
      return 'error: a cherry-pick is already in progress\nhint: try "git cherry-pick (--continue | --abort)"\nfatal: cherry-pick failed';
    case "revert":
      return 'error: a revert is already in progress\nhint: try "git revert (--continue | --abort)"\nfatal: revert failed';
    case "rebase":
      return 'fatal: It seems that there is already a rebase-merge directory.\nhint: Finish it with "git rebase --continue", or cancel it with "git rebase --abort".';
  }
}
