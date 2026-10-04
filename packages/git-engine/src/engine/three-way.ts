import { type GitContext } from "./context";
import { type FileChange } from "./diff";
import { type GitStatusEntry } from "./git-engine";
import { type MergeConflictRecord } from "./merge-state";
import { mergeText } from "./text-merge";
import { overwriteError, readBlobText, type WorkingTreeUpdate } from "./working-tree";

/** Tree contents as path → blob oid (see `readTreeFiles`). */
export type TreeFiles = ReadonlyMap<string, string>;

export interface ThreeWayInput {
  base: TreeFiles;
  ours: TreeFiles;
  theirs: TreeFiles;
  /** Conflict marker labels, e.g. `HEAD` and `feature/login`. */
  labels: { ours: string; theirs: string };
}

export interface ThreeWayResult {
  /** Working-tree (and, unless conflicted, index) updates that apply their side's changes. */
  updates: WorkingTreeUpdate[];
  /** Cleanly applied changes, for the diffstat. */
  changes: FileChange[];
  conflicts: MergeConflictRecord[];
  /** `Auto-merging x` / `CONFLICT (...)` lines, as Git prints them. */
  report: string[];
}

async function textOf(ctx: GitContext, oid: string | undefined): Promise<string | null> {
  return oid === undefined ? null : readBlobText(ctx, oid);
}

/**
 * Takes "their" changes relative to the base onto "ours", path by path, like Git's merge
 * machinery. Used by merge (base = merge base), cherry-pick (base = the commit's parent) and
 * revert (base = the commit, theirs = its parent). Nothing is written here: callers check
 * {@link threeWayOverwriteError}, then apply `updates` with `applyWorkingTreeUpdates`.
 */
export async function threeWay(ctx: GitContext, input: ThreeWayInput): Promise<ThreeWayResult> {
  const { base, ours, theirs, labels } = input;
  const result: ThreeWayResult = { updates: [], changes: [], conflicts: [], report: [] };
  const paths = [...new Set([...base.keys(), ...ours.keys(), ...theirs.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  for (const path of paths) {
    const [b, o, t] = [base.get(path), ours.get(path), theirs.get(path)];
    if (o === t || b === t) continue; // Nothing new from their side.
    const ourText = await textOf(ctx, o);
    if (b === o) {
      // Only their side changed this path.
      const after = await textOf(ctx, t);
      result.updates.push({ path, content: after });
      result.changes.push({ path, before: ourText, after });
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
      result.report.push(`Auto-merging ${path}`);
      const merged = mergeText(record.base ?? "", record.ours, record.theirs, labels);
      if (merged.conflicts === 0) {
        result.updates.push({ path, content: merged.text });
        result.changes.push({ path, before: ourText, after: merged.text });
        continue;
      }
      // The markers go in the working tree only; the index keeps our version until `git add`.
      result.updates.push({ path, content: merged.text, stage: false });
      result.report.push(
        `CONFLICT (${record.base === null ? "add/add" : "content"}): Merge conflict in ${path}`,
      );
    } else {
      // One side deleted the file, the other changed it. Leave the changed version in place.
      const kept = record.ours ?? record.theirs ?? "";
      result.updates.push({ path, content: kept, stage: false });
      const [deleted, changed] =
        record.ours === null ? ["HEAD", labels.theirs] : [labels.theirs, "HEAD"];
      result.report.push(
        `CONFLICT (modify/delete): ${path} deleted in ${deleted} and modified in ${changed}. Version ${changed} of ${path} left in tree.`,
      );
    }
    result.conflicts.push(record);
  }
  return result;
}

/**
 * Why applying `result` would lose uncommitted work, or `null` when it is safe. Like Git, staged
 * work anywhere blocks it too: the resulting commit is built from the index.
 */
export function threeWayOverwriteError(
  operation: "checkout" | "merge",
  result: ThreeWayResult,
  status: ReadonlyMap<string, GitStatusEntry>,
) {
  const touched = result.updates.map((update) => update.path);
  const staged = [...status.values()].filter((entry) => entry.staged !== null).map((e) => e.path);
  const checked = [...new Set([...touched, ...staged])].sort((a, b) => a.localeCompare(b));
  return overwriteError(operation, checked, status, (path) =>
    result.updates.some((update) => update.path === path && update.content !== null),
  );
}
