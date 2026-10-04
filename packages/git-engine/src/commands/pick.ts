import { type GitEngineError } from "@gitdojo/shared-types";
import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { formatChangeSummary } from "../engine/diff";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { DEFAULT_AUTHOR, type GitPickResult, type GitSequencerAction } from "../engine/git-engine";
import {
  operationInProgressMessage,
  operationKind,
  readMergeState,
  writeMergeState,
  type AuthorRecord,
} from "../engine/merge-state";
import { logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  isRepository,
  resolveRefOrNull,
  shortOid,
  subject,
} from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import { readStatusEntries } from "../engine/status-matrix";
import { threeWay, threeWayOverwriteError, type ThreeWayResult } from "../engine/three-way";
import { applyWorkingTreeUpdates, readTreeFiles } from "../engine/working-tree";
import { formatGitDate } from "./log";
import { undoTouchedPaths } from "./merge";

/** How a commit's changes are applied: forwards (cherry-pick, rebase) or backwards (revert). */
export type PickKind = "cherry-pick" | "revert" | "rebase";

export interface PreparedPick {
  oid: string;
  /** `abc1234 (subject)`, how Git labels the incoming side. */
  label: string;
  /** The original commit's subject line. */
  title: string;
  message: string;
  /** Cherry-picks keep the original author; a revert is new work by the learner (`undefined`). */
  author?: AuthorRecord;
  merged: ThreeWayResult;
}

/**
 * Works out what applying `oid` on top of HEAD changes, without writing anything:
 * cherry-pick / rebase take the commit's changes relative to its parent, revert takes the
 * parent's relative to the commit (that is, the changes backwards).
 */
export async function preparePick(
  ctx: GitContext,
  kind: PickKind,
  oid: string,
): Promise<{ ok: true; pick: PreparedPick } | { ok: false; error: GitEngineError }> {
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
  const command = kind === "rebase" ? "rebase" : kind;
  if (commit.parent.length > 1) {
    return {
      ok: false,
      error: gitError(
        "INVALID_ARGUMENT",
        `error: commit ${oid} is a merge but no -m option was given.\nfatal: ${command} failed`,
      ),
    };
  }
  const parent = commit.parent[0] ?? null;
  const [commitTree, parentTree, headTree] = await Promise.all([
    readTreeFiles(ctx, oid),
    readTreeFiles(ctx, parent),
    readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD")),
  ]);
  const title = subject(commit.message);
  const label = `${shortOid(oid)} (${title})`;
  const revert = kind === "revert";
  const merged = await threeWay(ctx, {
    base: revert ? commitTree : parentTree,
    ours: headTree,
    theirs: revert ? parentTree : commitTree,
    labels: { ours: "HEAD", theirs: revert ? `parent of ${label}` : label },
  });
  return {
    ok: true,
    pick: {
      oid,
      label,
      title,
      message: revert
        ? `Revert "${title}"\n\nThis reverts commit ${oid}.`
        : commit.message.trimEnd(),
      ...(revert
        ? {}
        : {
            author: {
              name: commit.author.name,
              email: commit.author.email,
              timestamp: commit.author.timestamp,
              timezoneOffset: commit.author.timezoneOffset,
            },
          }),
      merged,
    },
  };
}

/** Records the staged, picked changes as a commit on HEAD and returns its oid. */
export async function commitPick(
  ctx: GitContext,
  pick: Pick<PreparedPick, "message" | "author">,
  reflogMessage: string,
): Promise<string> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  const branch = await currentBranch(ctx);
  // The committer is always the learner, now; the author may be the original one.
  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message: pick.message,
    author: pick.author ?? DEFAULT_AUTHOR,
    committer: DEFAULT_AUTHOR,
  });
  await logHeadMove(ctx, { from: head, to: oid, message: reflogMessage, branch });
  return oid;
}

export function conflictHints(kind: "cherry-pick" | "revert", pick: PreparedPick): string[] {
  const verb = kind === "revert" ? "revert" : "apply";
  return [
    `error: could not ${verb} ${shortOid(pick.oid)}... ${pick.title}`,
    "hint: After resolving the conflicts, mark them with",
    'hint: "git add/rm <pathspec>", then run',
    `hint: "git ${kind} --continue".`,
    `hint: To abort and get back to the state before "git ${kind}",`,
    `hint: run "git ${kind} --abort".`,
  ];
}

const USAGE = {
  "cherry-pick": "usage: git cherry-pick <commit>\n   or: git cherry-pick (--continue | --abort)",
  revert: "usage: git revert <commit>\n   or: git revert (--continue | --abort)",
};

/** `git cherry-pick <commit>` and `git revert <commit>`. */
export async function runPick(
  ctx: GitContext,
  kind: "cherry-pick" | "revert",
  revision: string,
): Promise<GitPickResult> {
  if (revision === "") return failure(gitError("INVALID_ARGUMENT", USAGE[kind]));
  if (!(await isRepository(ctx))) return notARepository();
  const inProgress = await readMergeState(ctx);
  if (inProgress) {
    return failure(gitError("OPERATION_IN_PROGRESS", operationInProgressMessage(inProgress)));
  }
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) {
    const branch = (await currentBranch(ctx)) ?? "HEAD";
    return failure(
      gitError(
        "NO_COMMITS",
        `fatal: your current branch '${branch}' does not have any commits yet`,
      ),
    );
  }
  const oid = await resolveRevision(ctx, revision);
  if (oid === null) {
    return failure(gitError("INVALID_REVISION", `fatal: bad revision '${revision}'`));
  }

  const prepared = await preparePick(ctx, kind, oid);
  if (!prepared.ok) return failure(prepared.error);
  const { pick } = prepared;
  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  if (threeWayOverwriteError("merge", pick.merged, status)) {
    return failure(
      gitError(
        "LOCAL_CHANGES",
        `error: your local changes would be overwritten by ${kind}.\nhint: commit your changes or stash them to proceed.\nfatal: ${kind} failed`,
      ),
    );
  }
  const branch = await currentBranch(ctx);
  if (pick.merged.updates.length === 0) {
    const where = branch === null ? `HEAD detached at ${shortOid(head)}` : `On branch ${branch}`;
    const lines = [where, "nothing to commit, working tree clean"];
    if (kind === "cherry-pick") {
      lines.push("The previous cherry-pick is now empty, possibly due to conflict resolution.");
    }
    return failure(gitError("EMPTY_COMMIT", lines.join("\n")));
  }

  await applyWorkingTreeUpdates(ctx, pick.merged.updates);
  if (pick.merged.conflicts.length > 0) {
    await writeMergeState(ctx, {
      kind,
      branch: pick.label,
      theirs: oid,
      ours: head,
      message: pick.message,
      ...(pick.author ? { author: pick.author } : {}),
      conflicts: pick.merged.conflicts,
      touched: pick.merged.updates.map((update) => update.path),
    });
    const output = [...pick.merged.report, ...conflictHints(kind, pick)].join("\n");
    return {
      ok: false,
      output,
      data: { conflicts: pick.merged.conflicts.map((conflict) => conflict.path) },
      error: gitError("MERGE_CONFLICT", output),
    };
  }

  const created = await commitPick(ctx, pick, `${kind}: ${subject(pick.message)}`);
  const header = `[${branch ?? "detached HEAD"} ${shortOid(created)}] ${subject(pick.message)}`;
  const dateLine = pick.author
    ? [` Date: ${formatGitDate(pick.author.timestamp, pick.author.timezoneOffset)}`]
    : [];
  return success([header, ...dateLine, ...formatChangeSummary(pick.merged.changes)].join("\n"), {
    oid: created,
  });
}

/** `git cherry-pick` / `git revert` with `--continue`, `--abort` or `--skip`. */
export async function runSequencer(
  ctx: GitContext,
  kind: "cherry-pick" | "revert",
  action: GitSequencerAction,
  commit: (ctx: GitContext) => Promise<GitPickResult>,
): Promise<GitPickResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const state = await readMergeState(ctx);
  if (!state || operationKind(state) !== kind) {
    return failure(
      gitError(
        "NO_OPERATION",
        `error: no cherry-pick or revert in progress\nfatal: ${kind} failed`,
      ),
    );
  }
  if (action === "continue") return commit(ctx);
  // A single-commit pick has nothing after it: skipping it is the same as aborting.
  await undoTouchedPaths(ctx, state.touched);
  return success("", {});
}
