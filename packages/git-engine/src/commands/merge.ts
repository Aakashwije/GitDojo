import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  DEFAULT_AUTHOR,
  type ConflictKind,
  type GitAbortMergeResult,
  type GitMergeOptions,
  type GitMergeResult,
} from "../engine/git-engine";
import {
  clearMergeState,
  readMergeState,
  writeMergeState,
  type MergeConflictRecord,
} from "../engine/merge-state";
import { currentBranch, isRepository, resolveRefOrNull, shortOid } from "../engine/repository";
import { readStatusEntries } from "../engine/status-matrix";
import { lineStats, mergeText } from "../engine/text-merge";
import {
  applyWorkingTreeUpdates,
  overwriteError,
  readBlob,
  readBlobText,
  readTreeFiles,
  updatesFromTree,
  type WorkingTreeUpdate,
} from "../engine/working-tree";
import { isValidBranchName } from "./branch";

export const MERGE_USAGE = "usage: git merge [--no-ff] <branch>\n   or: git merge --abort";

const MERGE_IN_PROGRESS_MESSAGE =
  "fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.";

export function conflictKind(
  conflict: Pick<MergeConflictRecord, "base" | "ours" | "theirs">,
): ConflictKind {
  if (conflict.ours === null) return "deleted by us";
  if (conflict.theirs === null) return "deleted by them";
  return conflict.base === null ? "both added" : "both modified";
}

interface FileChange {
  path: string;
  before: string | null;
  after: string | null;
}

/**
 * Git's diffstat, e.g.
 *
 *    login.js | 5 +++++
 *    1 file changed, 5 insertions(+)
 *    create mode 100644 login.js
 */
export function formatDiffStat(changes: readonly FileChange[]): string[] {
  if (changes.length === 0) return [];
  const rows = changes.map((change) => ({
    path: change.path,
    ...lineStats(change.before ?? "", change.after ?? ""),
  }));
  const nameWidth = Math.max(...rows.map((row) => row.path.length));
  const countWidth = Math.max(...rows.map((row) => String(row.insertions + row.deletions).length));
  const bar = (count: number, char: string) => char.repeat(Math.min(count, 40));

  const insertions = rows.reduce((sum, row) => sum + row.insertions, 0);
  const deletions = rows.reduce((sum, row) => sum + row.deletions, 0);
  const summary = [`${String(rows.length)} file${rows.length === 1 ? "" : "s"} changed`];
  if (insertions > 0)
    summary.push(`${String(insertions)} insertion${insertions === 1 ? "" : "s"}(+)`);
  if (deletions > 0) summary.push(`${String(deletions)} deletion${deletions === 1 ? "" : "s"}(-)`);

  return [
    ...rows.map((row) =>
      ` ${row.path.padEnd(nameWidth)} | ${String(row.insertions + row.deletions).padStart(countWidth)} ${bar(row.insertions, "+")}${bar(row.deletions, "-")}`.trimEnd(),
    ),
    ` ${summary.join(", ")}`,
    ...changes.flatMap((change) => {
      if (change.before === null) return [` create mode 100644 ${change.path}`];
      if (change.after === null) return [` delete mode 100644 ${change.path}`];
      return [];
    }),
  ];
}

async function textOf(ctx: GitContext, oid: string | undefined): Promise<string | null> {
  return oid === undefined ? null : readBlobText(ctx, oid);
}

function mergeMessage(name: string, into: string | null): string {
  return into === null || into === "main" || into === "master"
    ? `Merge branch '${name}'`
    : `Merge branch '${name}' into ${into}`;
}

async function moveBranch(ctx: GitContext, branch: string | null, oid: string): Promise<void> {
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: branch === null ? "HEAD" : `refs/heads/${branch}`,
    value: oid,
    force: true,
  });
}

/** `git merge <branch>`. */
export async function runMerge(
  ctx: GitContext,
  name: string,
  options: GitMergeOptions = {},
): Promise<GitMergeResult> {
  if (name === "") {
    return failure(gitError("INVALID_ARGUMENT", `fatal: no branch to merge\n${MERGE_USAGE}`));
  }
  if (!(await isRepository(ctx))) return notARepository();
  if (await readMergeState(ctx)) {
    return failure(gitError("MERGE_IN_PROGRESS", MERGE_IN_PROGRESS_MESSAGE));
  }

  const theirs = isValidBranchName(name) ? await resolveRefOrNull(ctx, `refs/heads/${name}`) : null;
  if (theirs === null) {
    return failure(gitError("BRANCH_NOT_FOUND", `merge: ${name} - not something we can merge`));
  }

  const branch = await currentBranch(ctx);
  const ours = await resolveRefOrNull(ctx, "HEAD");
  if (
    ours !== null &&
    (ours === theirs ||
      (await git.isDescendent({
        fs: ctx.fs,
        dir: ctx.dir,
        oid: ours,
        ancestor: theirs,
        depth: -1,
      })))
  ) {
    return success("Already up to date.", { type: "up-to-date", oid: ours });
  }

  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  const bases =
    ours === null
      ? []
      : ((await git.findMergeBase({ fs: ctx.fs, dir: ctx.dir, oids: [ours, theirs] })) as string[]);
  const base = bases[0] ?? null;
  const [baseTree, oursTree, theirsTree] = await Promise.all([
    readTreeFiles(ctx, base),
    readTreeFiles(ctx, ours),
    readTreeFiles(ctx, theirs),
  ]);

  // Fast-forward: the current branch has nothing of its own, so it simply moves up to theirs.
  if (base === ours && !options.noFastForward) {
    const paths = [...new Set([...oursTree.keys(), ...theirsTree.keys()])]
      .filter((path) => oursTree.get(path) !== theirsTree.get(path))
      .sort((a, b) => a.localeCompare(b));
    const problem = overwriteError("merge", paths, status, (path) => theirsTree.has(path));
    if (problem) return failure(problem);

    const changes = await Promise.all(
      paths.map(async (path) => ({
        path,
        before: await textOf(ctx, oursTree.get(path)),
        after: await textOf(ctx, theirsTree.get(path)),
      })),
    );
    await applyWorkingTreeUpdates(
      ctx,
      await updatesFromTree(paths, theirsTree, (oid) => readBlob(ctx, oid)),
    );
    await moveBranch(ctx, branch, theirs);
    const range = ours === null ? shortOid(theirs) : `${shortOid(ours)}..${shortOid(theirs)}`;
    return success([`Updating ${range}`, "Fast-forward", ...formatDiffStat(changes)].join("\n"), {
      type: "fast-forward",
      oid: theirs,
    });
  }

  // Three-way merge: take each side's changes relative to the merge base.
  const updates: WorkingTreeUpdate[] = [];
  const changes: FileChange[] = [];
  const conflicts: MergeConflictRecord[] = [];
  const report: string[] = [];
  const paths = [...new Set([...baseTree.keys(), ...oursTree.keys(), ...theirsTree.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );

  for (const path of paths) {
    const [b, o, t] = [baseTree.get(path), oursTree.get(path), theirsTree.get(path)];
    if (o === t || b === t) continue; // Nothing new from their side.
    const ourText = await textOf(ctx, o);
    if (b === o) {
      // Only their side changed this path.
      const after = await textOf(ctx, t);
      updates.push({ path, content: after });
      changes.push({ path, before: ourText, after });
      continue;
    }

    const record: MergeConflictRecord = {
      path,
      base: await textOf(ctx, b),
      ours: ourText,
      theirs: await textOf(ctx, t),
      resolved: false,
    };
    if (record.ours !== null && record.theirs !== null) {
      report.push(`Auto-merging ${path}`);
      const merged = mergeText(record.base ?? "", record.ours, record.theirs, {
        ours: "HEAD",
        theirs: name,
      });
      if (merged.conflicts === 0) {
        updates.push({ path, content: merged.text });
        changes.push({ path, before: ourText, after: merged.text });
        continue;
      }
      // The markers go in the working tree only; the index keeps our version until `git add`.
      updates.push({ path, content: merged.text, stage: false });
      report.push(
        `CONFLICT (${record.base === null ? "add/add" : "content"}): Merge conflict in ${path}`,
      );
    } else {
      // One side deleted the file, the other changed it. Leave the changed version in place.
      const kept = record.ours ?? record.theirs ?? "";
      updates.push({ path, content: kept, stage: false });
      const [deleted, changed] = record.ours === null ? ["HEAD", name] : [name, "HEAD"];
      report.push(
        `CONFLICT (modify/delete): ${path} deleted in ${deleted} and modified in ${changed}. Version ${changed} of ${path} left in tree.`,
      );
    }
    conflicts.push(record);
  }

  const touched = updates.map((update) => update.path);
  // A merge commit is built from the index, so staged work elsewhere would sneak into it.
  const staged = [...status.values()].filter((entry) => entry.staged !== null).map((e) => e.path);
  const checked = [...new Set([...touched, ...staged])].sort((a, b) => a.localeCompare(b));
  const problem = overwriteError("merge", checked, status, (path) =>
    updates.some((update) => update.path === path && update.content !== null),
  );
  if (problem) return failure(problem);
  await applyWorkingTreeUpdates(ctx, updates);

  const message = mergeMessage(name, branch);
  if (conflicts.length > 0) {
    await writeMergeState(ctx, {
      branch: name,
      theirs,
      ours: ours ?? theirs,
      message,
      conflicts,
      touched,
    });
    const output = [
      ...report,
      "Automatic merge failed; fix conflicts and then commit the result.",
    ].join("\n");
    return {
      ok: false,
      output,
      data: { type: "conflict", conflicts: conflicts.map((conflict) => conflict.path) },
      error: gitError("MERGE_CONFLICT", output),
    };
  }

  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author: DEFAULT_AUTHOR,
    parent: ours === null ? [theirs] : [ours, theirs],
  });
  return success(
    [...report, "Merge made by the 'ort' strategy.", ...formatDiffStat(changes)].join("\n"),
    { type: "merge-commit", oid },
  );
}

/** `git merge --abort`: puts every path the merge touched back to HEAD's version. */
export async function runAbortMerge(ctx: GitContext): Promise<GitAbortMergeResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const state = await readMergeState(ctx);
  if (!state) {
    return failure(gitError("NO_MERGE", "fatal: There is no merge to abort (MERGE_HEAD missing)."));
  }
  const head = await readTreeFiles(ctx, await resolveRefOrNull(ctx, "HEAD"));
  await applyWorkingTreeUpdates(
    ctx,
    await updatesFromTree(state.touched, head, (oid) => readBlob(ctx, oid)),
  );
  await clearMergeState(ctx);
  // Real `git merge --abort` is silent on success.
  return success("", { restoredPaths: state.touched });
}
