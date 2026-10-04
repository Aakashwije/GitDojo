import { type GitContext } from "../engine/context";
import { formatDiffStat } from "../engine/diff";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitStashPushOptions, type GitStashResult } from "../engine/git-engine";
import { operationInProgressMessage, readMergeState } from "../engine/merge-state";
import {
  currentBranch,
  describeCommit,
  isRepository,
  resolveRefOrNull,
} from "../engine/repository";
import {
  readStashes,
  stashIndex,
  stashOid,
  toStashEntry,
  writeStashes,
  type StashedFile,
  type StashRecord,
} from "../engine/stash-store";
import { readStatusEntries } from "../engine/status-matrix";
import { mergeText } from "../engine/text-merge";
import {
  applyWorkingTreeUpdates,
  readBlobText,
  readIndexFiles,
  readTreeFiles,
  readWorkingText,
  type WorkingTreeUpdate,
} from "../engine/working-tree";
import { formatStatus, readStatusData } from "./status";

const KEPT = "The stash entry is kept in case you need it again.";

async function entries(ctx: GitContext) {
  return (await readStashes(ctx)).map(toStashEntry);
}

async function textAt(
  ctx: GitContext,
  tree: ReadonlyMap<string, string>,
  path: string,
): Promise<string | null> {
  const oid = tree.get(path);
  return oid === undefined ? null : readBlobText(ctx, oid);
}

/** `git stash` / `git stash push [-m <message>] [-u]`. */
export async function runStashPush(
  ctx: GitContext,
  { message, includeUntracked = false }: GitStashPushOptions = {},
): Promise<GitStashResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) {
    return failure(gitError("NO_COMMITS", "You do not have the initial commit yet"));
  }
  const operation = await readMergeState(ctx);
  if (operation) {
    return failure(gitError("OPERATION_IN_PROGRESS", operationInProgressMessage(operation)));
  }

  const status = await readStatusEntries(ctx);
  const changed = status.filter(
    (entry) =>
      entry.staged !== null ||
      entry.unstaged === "modified" ||
      entry.unstaged === "deleted" ||
      (includeUntracked && entry.unstaged === "untracked"),
  );
  if (changed.length === 0) {
    // Not an error in Git: it simply has nothing to do.
    return success("No local changes to save", { stashes: await entries(ctx) });
  }

  const [index, headTree] = await Promise.all([readIndexFiles(ctx), readTreeFiles(ctx, head)]);
  const files: StashedFile[] = await Promise.all(
    changed.map(async (entry) => ({
      path: entry.path,
      index: await textAt(ctx, index, entry.path),
      worktree: await readWorkingText(ctx, entry.path),
      added: !entry.inHead,
      untracked: entry.unstaged === "untracked",
    })),
  );

  // Put every stashed path back to HEAD, in the index and the working tree.
  await applyWorkingTreeUpdates(
    ctx,
    await Promise.all(
      changed.map(async (entry): Promise<WorkingTreeUpdate> => {
        if (entry.unstaged === "untracked")
          return { path: entry.path, content: null, stage: false };
        return { path: entry.path, content: await textAt(ctx, headTree, entry.path) };
      }),
    ),
  );

  const branch = await currentBranch(ctx);
  const where = branch ?? "(no branch)";
  const record: Omit<StashRecord, "oid"> = {
    message: message
      ? `On ${where}: ${message}`
      : `WIP on ${where}: ${await describeCommit(ctx, head)}`,
    branch,
    base: head,
    timestamp: Math.floor(Date.now() / 1000),
    files,
  };
  const stashes = [{ ...record, oid: await stashOid(record) }, ...(await readStashes(ctx))];
  await writeStashes(ctx, stashes);
  return success(`Saved working directory and index state ${record.message}`, {
    stashes: stashes.map(toStashEntry),
  });
}

/** `git stash list`: one line per entry, newest first. */
export async function runStashList(ctx: GitContext): Promise<GitStashResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const stashes = await entries(ctx);
  return success(
    stashes.map((stash) => `stash@{${String(stash.index)}}: ${stash.message}`).join("\n"),
    { stashes },
  );
}

async function findStash(
  ctx: GitContext,
  reference: string | undefined,
): Promise<
  { ok: true; index: number; record: StashRecord } | { ok: false; result: GitStashResult }
> {
  const stashes = await readStashes(ctx);
  if (stashes.length === 0) {
    return { ok: false, result: failure(gitError("NO_STASH", "No stash entries found.")) };
  }
  const index = stashIndex(reference);
  const record = index === null ? undefined : stashes[index];
  if (index === null || !record) {
    return {
      ok: false,
      result: failure(
        gitError("NO_STASH", `error: ${reference ?? "stash@{0}"} is not a valid reference`),
      ),
    };
  }
  return { ok: true, index, record };
}

/**
 * `git stash apply` and `git stash pop`. Stashed edits are merged into the current files: where
 * HEAD has moved on since the stash, both changes are kept, or conflict markers labelled
 * "Updated upstream" and "Stashed changes" are left in the file. A conflicting pop keeps the entry.
 */
export async function runStashApply(
  ctx: GitContext,
  reference: string | undefined,
  { pop = false }: { pop?: boolean } = {},
): Promise<GitStashResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const found = await findStash(ctx, reference);
  if (!found.ok) return found.result;
  const { index, record } = found;
  const operation = await readMergeState(ctx);
  if (operation) {
    return failure(gitError("OPERATION_IN_PROGRESS", operationInProgressMessage(operation)));
  }

  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  const blocked = record.files
    .filter((file) => {
      const entry = status.get(file.path);
      if (!entry) return false;
      return (
        entry.staged !== null ||
        entry.unstaged === "modified" ||
        entry.unstaged === "deleted" ||
        (entry.unstaged === "untracked" && file.worktree !== null)
      );
    })
    .map((file) => file.path);
  if (blocked.length > 0) {
    return failure(
      gitError(
        "LOCAL_CHANGES",
        [
          "error: Your local changes to the following files would be overwritten by merge:",
          ...blocked.map((path) => `\t${path}`),
          "Please commit your changes or stash them before you merge.",
          "Aborting",
          KEPT,
        ].join("\n"),
      ),
    );
  }

  const [baseTree, headTree] = await Promise.all([
    readTreeFiles(ctx, record.base),
    readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD")),
  ]);
  const updates: WorkingTreeUpdate[] = [];
  const report: string[] = [];
  const conflicts: string[] = [];
  for (const file of record.files) {
    if (file.untracked) {
      updates.push({ path: file.path, content: file.worktree, stage: false });
      continue;
    }
    const base = await textAt(ctx, baseTree, file.path);
    const current = await textAt(ctx, headTree, file.path);
    const stashed = file.worktree;
    // New files go back into the staging area, as Git does; edits come back unstaged.
    const stage = file.added && stashed !== null;
    if (current === base || stashed === current) {
      updates.push({ path: file.path, content: stashed, stage });
      continue;
    }
    if (stashed === base) continue; // Only HEAD changed this path since: nothing to bring back.
    if (current === null || stashed === null) {
      report.push(
        `CONFLICT (modify/delete): ${file.path} deleted in one side and modified in the other.`,
      );
      updates.push({ path: file.path, content: stashed ?? current, stage: false });
      conflicts.push(file.path);
      continue;
    }
    report.push(`Auto-merging ${file.path}`);
    const merged = mergeText(base ?? "", current, stashed, {
      ours: "Updated upstream",
      theirs: "Stashed changes",
    });
    updates.push({ path: file.path, content: merged.text, stage: false });
    if (merged.conflicts > 0) {
      report.push(`CONFLICT (content): Merge conflict in ${file.path}`);
      conflicts.push(file.path);
    }
  }
  await applyWorkingTreeUpdates(ctx, updates);

  if (conflicts.length > 0) {
    const output = [...report, KEPT].join("\n");
    return {
      ok: false,
      output,
      data: { stashes: await entries(ctx), conflicts },
      error: gitError("MERGE_CONFLICT", output),
    };
  }

  const lines = [...report, formatStatus(await readStatusData(ctx))];
  if (pop) {
    const stashes = await readStashes(ctx);
    stashes.splice(index, 1);
    await writeStashes(ctx, stashes);
    lines.push(`Dropped refs/stash@{${String(index)}} (${record.oid})`);
  }
  return success(lines.join("\n"), { stashes: await entries(ctx) });
}

/** `git stash drop [stash@{n}]`. */
export async function runStashDrop(
  ctx: GitContext,
  reference: string | undefined,
): Promise<GitStashResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const found = await findStash(ctx, reference);
  if (!found.ok) return found.result;
  const stashes = await readStashes(ctx);
  stashes.splice(found.index, 1);
  await writeStashes(ctx, stashes);
  return success(`Dropped refs/stash@{${String(found.index)}} (${found.record.oid})`, {
    stashes: stashes.map(toStashEntry),
  });
}

/** `git stash show [stash@{n}]`: a diffstat of what the entry changes. */
export async function runStashShow(
  ctx: GitContext,
  reference: string | undefined,
): Promise<GitStashResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const found = await findStash(ctx, reference);
  if (!found.ok) return found.result;
  const baseTree = await readTreeFiles(ctx, found.record.base);
  const changes = await Promise.all(
    found.record.files
      .filter((file) => !file.untracked)
      .map(async (file) => ({
        path: file.path,
        before: await textAt(ctx, baseTree, file.path),
        after: file.worktree,
      })),
  );
  return success(formatDiffStat(changes).join("\n"), { stashes: await entries(ctx) });
}
