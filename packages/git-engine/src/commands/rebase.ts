import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  type GitRebaseResult,
  type GitSequencerAction,
  type GitCommitInfo,
} from "../engine/git-engine";
import {
  clearMergeState,
  operationInProgressMessage,
  operationKind,
  readMergeState,
  unresolvedConflicts,
  writeMergeState,
  type MergeStateRecord,
  type RebaseRecord,
} from "../engine/merge-state";
import { logBranchMove, logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  isAncestor,
  isRepository,
  readCommitsFrom,
  resolveRefOrNull,
  shortOid,
  subject,
  topologicalOrder,
} from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import { hasStagedChanges, readStatusEntries } from "../engine/status-matrix";
import { applyWorkingTreeUpdates } from "../engine/working-tree";
import { commitPick, preparePick } from "./pick";
import { forceCheckout } from "./reset";
import { checkoutCommit } from "./switch";

export const REBASE_USAGE =
  "usage: git rebase <upstream>\n   or: git rebase (--continue | --skip | --abort)";

const NO_REBASE = "fatal: No rebase in progress?";

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

async function detachAt(ctx: GitContext, oid: string): Promise<void> {
  await git.writeRef({ fs: ctx.fs, dir: ctx.dir, ref: "HEAD", value: oid, force: true });
}

/** The branch's own commits (not reachable from `onto`), oldest first. Merges are dropped. */
async function commitsToReplay(ctx: GitContext, head: string, onto: string): Promise<string[]> {
  const ontoHistory = new Set((await readCommitsFrom(ctx, [onto])).map((commit) => commit.oid));
  const own = (await readCommitsFrom(ctx, [head])).filter(
    (commit: GitCommitInfo) => !ontoHistory.has(commit.oid) && commit.parents.length <= 1,
  );
  return topologicalOrder(own)
    .map((commit) => commit.oid)
    .reverse();
}

/** Points the rebased branch at where HEAD ended up and attaches HEAD to it again. */
async function finish(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) throw new Error("rebase lost HEAD");
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: `refs/heads/${rebase.branch}`,
    value: head,
    force: true,
  });
  await logBranchMove(ctx, rebase.branch, {
    from: rebase.originalHead,
    to: head,
    message: `rebase (finish): refs/heads/${rebase.branch} onto ${rebase.onto}`,
  });
  await attachHead(ctx, rebase.branch);
  await logHeadMove(ctx, {
    from: head,
    to: head,
    message: `rebase (finish): returning to refs/heads/${rebase.branch}`,
  });
  await clearMergeState(ctx);
  return success(`Successfully rebased and updated refs/heads/${rebase.branch}.`, {
    status: "rebased",
    oid: head,
  });
}

/**
 * Replays `rebase.todo` one commit at a time on top of HEAD. Stops at the first conflict, saving
 * where it is so `git rebase --continue` can pick up from there; finishes the rebase otherwise.
 */
async function replay(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  const report: string[] = [];
  const todo = [...rebase.todo];
  for (let oid = todo.shift(); oid !== undefined; oid = todo.shift()) {
    const prepared = await preparePick(ctx, "rebase", oid);
    if (!prepared.ok) return failure(prepared.error);
    const { pick } = prepared;
    // A commit whose changes `onto` already has adds nothing: Git drops it.
    if (pick.merged.updates.length === 0) continue;
    await applyWorkingTreeUpdates(ctx, pick.merged.updates);
    if (pick.merged.conflicts.length > 0) {
      const head = await resolveRefOrNull(ctx, "HEAD");
      const state: MergeStateRecord = {
        kind: "rebase",
        branch: pick.label,
        theirs: oid,
        ours: head ?? rebase.onto,
        message: pick.message,
        ...(pick.author ? { author: pick.author } : {}),
        conflicts: pick.merged.conflicts,
        touched: pick.merged.updates.map((update) => update.path),
        rebase: { ...rebase, todo, current: oid },
      };
      await writeMergeState(ctx, state);
      const line = `Could not apply ${shortOid(oid)}... ${subject(pick.message)}`;
      const output = [
        ...report,
        ...pick.merged.report,
        `error: could not apply ${shortOid(oid)}... ${subject(pick.message)}`,
        "hint: Resolve all conflicts manually, mark them as resolved with",
        'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".',
        'hint: You can instead skip this commit: run "git rebase --skip".',
        'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
        line,
      ].join("\n");
      return {
        ok: false,
        output,
        data: { status: "conflict", conflicts: pick.merged.conflicts.map((c) => c.path) },
        error: gitError("MERGE_CONFLICT", output),
      };
    }
    await commitPick(ctx, pick, `rebase (pick): ${subject(pick.message)}`);
  }
  return finish(ctx, rebase);
}

/** `git rebase <upstream>`: replays the current branch's own commits on top of `upstream`. */
export async function runRebase(ctx: GitContext, upstream: string): Promise<GitRebaseResult> {
  if (upstream === "") return failure(gitError("INVALID_ARGUMENT", REBASE_USAGE));
  if (!(await isRepository(ctx))) return notARepository();
  const inProgress = await readMergeState(ctx);
  if (inProgress) {
    return failure(gitError("OPERATION_IN_PROGRESS", operationInProgressMessage(inProgress)));
  }
  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (branch === null || head === null) {
    return failure(
      gitError(
        "NOT_ON_BRANCH",
        branch === null
          ? "fatal: You are not currently on a branch.\nhint: GitDojo rebases branches: switch to one first."
          : `fatal: your current branch '${branch}' does not have any commits yet`,
      ),
    );
  }
  const onto = await resolveRevision(ctx, upstream);
  if (onto === null) {
    return failure(gitError("INVALID_REVISION", `fatal: invalid upstream '${upstream}'`));
  }

  const status = await readStatusEntries(ctx);
  if (hasStagedChanges(status)) {
    return failure(
      gitError(
        "LOCAL_CHANGES",
        "error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.",
      ),
    );
  }
  if (status.some((entry) => entry.unstaged === "modified" || entry.unstaged === "deleted")) {
    return failure(
      gitError(
        "LOCAL_CHANGES",
        "error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.",
      ),
    );
  }

  if (await isAncestor(ctx, onto, head)) {
    return success(`Current branch ${branch} is up to date.`, { status: "up-to-date", oid: head });
  }

  const start = await checkoutCommit(ctx, head, onto);
  if (!start.ok) return failure(start.error);
  await detachAt(ctx, onto);
  await logHeadMove(ctx, { from: head, to: onto, message: `rebase (start): checkout ${upstream}` });

  const rebase: RebaseRecord = {
    branch,
    originalHead: head,
    onto,
    todo: await commitsToReplay(ctx, head, onto),
    current: null,
  };
  // The branch has nothing of its own: it simply catches up (a fast-forward).
  if (rebase.todo.length === 0) {
    const finished = await finish(ctx, rebase);
    return finished.ok ? { ...finished, data: { status: "fast-forward", oid: onto } } : finished;
  }
  return replay(ctx, rebase);
}

/** `git rebase --continue | --skip | --abort`. */
export async function runRebaseControl(
  ctx: GitContext,
  action: GitSequencerAction,
): Promise<GitRebaseResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const state = await readMergeState(ctx);
  if (!state?.rebase || operationKind(state) !== "rebase") {
    return failure(gitError("NO_OPERATION", NO_REBASE));
  }
  const { rebase } = state;

  if (action === "abort") {
    // Everything goes back to how it was; the branch itself never moved.
    await forceCheckout(ctx, rebase.originalHead);
    const head = await resolveRefOrNull(ctx, "HEAD");
    await clearMergeState(ctx);
    await attachHead(ctx, rebase.branch);
    await logHeadMove(ctx, {
      from: head,
      to: rebase.originalHead,
      message: `rebase (abort): returning to refs/heads/${rebase.branch}`,
    });
    return success("", { status: "aborted", oid: rebase.originalHead });
  }

  if (action === "skip") {
    // Drop the stopped commit: back to HEAD, then on with the rest.
    await forceCheckout(ctx, await resolveRefOrNull(ctx, "HEAD"));
    await clearMergeState(ctx);
    return replay(ctx, { ...rebase, current: null });
  }

  if (unresolvedConflicts(state).length > 0) {
    return failure(
      gitError(
        "UNRESOLVED_CONFLICTS",
        "error: you must edit all merge conflicts and then\nmark them as resolved using git add",
      ),
    );
  }
  // The stopped commit, unless `git commit` already recorded it.
  if (rebase.current !== null && hasStagedChanges(await readStatusEntries(ctx))) {
    await commitPick(ctx, state, `rebase (continue): ${subject(state.message)}`);
  }
  await clearMergeState(ctx);
  return replay(ctx, { ...rebase, current: null });
}
