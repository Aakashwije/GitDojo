import { type GitEngineError } from "@gitdojo/shared-types";
import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  type GitDetachOptions,
  type GitSwitchData,
  type GitSwitchResult,
} from "../engine/git-engine";
import { readMergeState } from "../engine/merge-state";
import { logBranchMove, logHeadMove, previousCheckout } from "../engine/reflog";
import {
  currentBranch,
  describeCommit,
  isRepository,
  resolveRefOrNull,
  shortOid,
  unreachableFromBranches,
} from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import { readStatusEntries } from "../engine/status-matrix";
import {
  applyWorkingTreeUpdates,
  overwriteError,
  readBlob,
  readTreeFiles,
  updatesFromTree,
} from "../engine/working-tree";
import { newBranchNameError } from "./branch";

export const MISSING_BRANCH_ARGUMENT = "fatal: missing branch or commit argument";

/**
 * Makes the working tree and index match `to` instead of `from`. Only paths whose committed
 * content differs are touched, so uncommitted work elsewhere carries over, as in Git. Refuses
 * (changing nothing) when that would overwrite local changes.
 */
export async function checkoutCommit(
  ctx: GitContext,
  from: string | null,
  to: string | null,
): Promise<{ ok: true; paths: string[] } | { ok: false; error: GitEngineError }> {
  const [before, after] = await Promise.all([readTreeFiles(ctx, from), readTreeFiles(ctx, to)]);
  const changed = new Set<string>();
  for (const [path, oid] of before) if (after.get(path) !== oid) changed.add(path);
  for (const path of after.keys()) if (!before.has(path)) changed.add(path);
  const paths = [...changed].sort((a, b) => a.localeCompare(b));

  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  // Refuse, like Git, instead of silently overwriting the learner's work.
  const problem = overwriteError("checkout", paths, status, (path) => after.has(path));
  if (problem) return { ok: false, error: problem };

  await applyWorkingTreeUpdates(
    ctx,
    await updatesFromTree(paths, after, (oid) => readBlob(ctx, oid)),
  );
  return { ok: true, paths };
}

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

/** How the reflog names where HEAD was: the branch, or the full commit id when detached. */
function position(branch: string | null, oid: string | null): string {
  return branch ?? oid ?? "HEAD";
}

/**
 * What Git prints when HEAD leaves a detached position: a warning about commits only that
 * position held, or a note of where it was.
 */
async function leavingDetachedHead(
  ctx: GitContext,
  previous: string,
): Promise<{ lines: string[]; orphaned: string[] }> {
  const orphaned = await unreachableFromBranches(ctx, previous);
  if (orphaned.length === 0) {
    return {
      lines: [`Previous HEAD position was ${await describeCommit(ctx, previous)}`],
      orphaned: [],
    };
  }
  const count = orphaned.length;
  const plural = count === 1 ? "" : "s";
  return {
    orphaned: orphaned.map((commit) => commit.oid),
    lines: [
      `Warning: you are leaving ${String(count)} commit${plural} behind, not connected to`,
      "any of your branches:",
      "",
      ...orphaned
        .slice(0, 4)
        .map((commit) => `  ${commit.shortOid} ${commit.message.split("\n")[0] ?? ""}`),
      ...(count > 4 ? [` ... and ${String(count - 4)} more.`] : []),
      "",
      `If you want to keep ${count === 1 ? "it" : "them"} by creating a new branch, this may be a good time`,
      "to do so with:",
      "",
      ` git branch <new-branch-name> ${shortOid(previous)}`,
      "",
    ],
  };
}

function result(data: GitSwitchData, lines: string[]): GitSwitchResult {
  return success(lines.join("\n"), data);
}

async function createAndSwitch(
  ctx: GitContext,
  name: string,
  startPoint: string | undefined,
): Promise<GitSwitchResult> {
  const nameError = await newBranchNameError(ctx, name);
  if (nameError) return failure(nameError);

  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  const start = startPoint === undefined ? head : await resolveRevision(ctx, startPoint);
  if (start === null && startPoint !== undefined) {
    return failure(gitError("INVALID_REVISION", `fatal: invalid reference: ${startPoint}`));
  }

  let updatedPaths: string[] = [];
  if (start !== head) {
    const checkout = await checkoutCommit(ctx, head, start);
    if (!checkout.ok) return failure(checkout.error);
    updatedPaths = checkout.paths;
  }
  // On an unborn branch there is nothing to point at yet: Git simply renames the future branch.
  if (start !== null) {
    await git.branch({ fs: ctx.fs, dir: ctx.dir, ref: name, object: start });
    await logBranchMove(ctx, name, {
      from: null,
      to: start,
      message: `branch: Created from ${startPoint ?? "HEAD"}`,
    });
  }
  await attachHead(ctx, name);
  if (start !== null) {
    await logHeadMove(ctx, {
      from: head,
      to: start,
      message: `checkout: moving from ${position(branch, head)} to ${name}`,
    });
  }
  // A new branch at the detached commit keeps that commit; one elsewhere may leave work behind.
  const leaving =
    branch === null && head !== null && head !== start
      ? await leavingDetachedHead(ctx, head)
      : { lines: [], orphaned: [] };
  return result(
    {
      branch: name,
      oid: start,
      switched: true,
      created: true,
      updatedPaths,
      orphaned: leaving.orphaned,
    },
    [...leaving.lines, `Switched to a new branch '${name}'`],
  );
}

async function switchToExisting(ctx: GitContext, name: string): Promise<GitSwitchResult> {
  const target = await resolveRefOrNull(ctx, `refs/heads/${name}`);
  if (target === null) {
    // `git switch` only takes branches; a commit needs `--detach`.
    if ((await resolveRevision(ctx, name)) !== null) {
      return failure(
        gitError(
          "BRANCH_NOT_FOUND",
          `fatal: a branch is expected, got commit '${name}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.`,
        ),
      );
    }
    return failure(gitError("BRANCH_NOT_FOUND", `fatal: invalid reference: ${name}`));
  }
  const branch = await currentBranch(ctx);
  if (branch === name) {
    return result(
      {
        branch: name,
        oid: target,
        switched: false,
        created: false,
        updatedPaths: [],
        orphaned: [],
      },
      [`Already on '${name}'`],
    );
  }

  const head = await resolveRefOrNull(ctx, "HEAD");
  const checkout = await checkoutCommit(ctx, head, target);
  if (!checkout.ok) return failure(checkout.error);
  await attachHead(ctx, name);
  await logHeadMove(ctx, {
    from: head,
    to: target,
    message: `checkout: moving from ${position(branch, head)} to ${name}`,
  });

  const leaving =
    branch === null && head !== null && head !== target
      ? await leavingDetachedHead(ctx, head)
      : { lines: [], orphaned: [] };
  return result(
    {
      branch: name,
      oid: target,
      switched: true,
      created: false,
      updatedPaths: checkout.paths,
      orphaned: leaving.orphaned,
    },
    [...leaving.lines, `Switched to branch '${name}'`],
  );
}

const DETACHED_ADVICE = [
  "You are in 'detached HEAD' state. You can look around, make experimental",
  "changes and commit them, and you can discard any commits you make in this",
  "state without impacting any branches by switching back to a branch.",
  "",
  "If you want to create a new branch to retain commits you create, you may",
  "do so (now or later) by using -c with the switch command. Example:",
  "",
  "  git switch -c <new-branch-name>",
  "",
  "Or undo this operation with:",
  "",
  "  git switch -",
  "",
  "Turn off this advice by setting config variable advice.detachedHead to false",
  "",
];

/** `git switch --detach <revision>` and `git checkout <commit>`. */
export async function runDetach(
  ctx: GitContext,
  revision: string,
  { advice = false }: GitDetachOptions = {},
): Promise<GitSwitchResult> {
  const guard = await switchPreconditions(ctx, revision);
  if (guard) return guard;

  const target = await resolveRevision(ctx, revision);
  if (target === null) {
    return failure(gitError("INVALID_REVISION", `fatal: invalid reference: ${revision}`));
  }
  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  const checkout = await checkoutCommit(ctx, head, target);
  if (!checkout.ok) return failure(checkout.error);
  await detachAt(ctx, target);
  if (head !== target || branch !== null) {
    await logHeadMove(ctx, {
      from: head,
      to: target,
      message: `checkout: moving from ${position(branch, head)} to ${target}`,
    });
  }

  const leaving =
    branch === null && head !== null && head !== target
      ? await leavingDetachedHead(ctx, head)
      : { lines: [], orphaned: [] };
  const landed = `HEAD is now at ${await describeCommit(ctx, target)}`;
  const lines =
    advice && branch !== null
      ? [`Note: switching to '${revision}'.`, "", ...DETACHED_ADVICE, landed]
      : [...leaving.lines, landed];
  return result(
    {
      branch: null,
      oid: target,
      switched: head !== target || branch !== null,
      created: false,
      updatedPaths: checkout.paths,
      orphaned: leaving.orphaned,
    },
    lines,
  );
}

/** Errors every form of switching shares, or `null` when it may go ahead. */
async function switchPreconditions(ctx: GitContext, name: string): Promise<GitSwitchResult | null> {
  if (name === "") return failure(gitError("INVALID_ARGUMENT", MISSING_BRANCH_ARGUMENT));
  if (!(await isRepository(ctx))) return notARepository();
  if (await readMergeState(ctx)) {
    return failure(
      gitError(
        "MERGE_IN_PROGRESS",
        "error: you need to resolve your current index first\nhint: Finish the merge with 'git commit', or cancel it with 'git merge --abort'.",
      ),
    );
  }
  return null;
}

/** `git switch <name>`, `git switch -` and `git switch -c <name> [<start-point>]`. */
export async function runSwitch(
  ctx: GitContext,
  name: string,
  { create, startPoint }: { create: boolean; startPoint?: string },
): Promise<GitSwitchResult> {
  const guard = await switchPreconditions(ctx, name);
  if (guard) return guard;
  if (create) return createAndSwitch(ctx, name, startPoint);
  if (name !== "-") return switchToExisting(ctx, name);

  const previous = await previousCheckout(ctx);
  if (previous === null) {
    return failure(gitError("BRANCH_NOT_FOUND", "fatal: invalid reference: @{-1}"));
  }
  return switchToExisting(ctx, previous);
}
