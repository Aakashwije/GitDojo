import { type GitDiffHunk, type GitDiffLine, type GitFileDiff } from "./git-engine";
import { lineStats, matchLines, splitLines } from "./text-merge";

/** A path's content before and after a change; `null` where the file does not exist. */
export interface FileChange {
  path: string;
  before: string | null;
  after: string | null;
}

const CONTEXT = 3;

interface Edit {
  type: GitDiffLine["type"];
  text: string;
  /** 1-based line numbers in the old and new text (the next line, for an add or remove). */
  oldLine: number;
  newLine: number;
}

/** Every line of both texts, in order, as kept / removed / added. */
function editScript(before: string, after: string): Edit[] {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  const matches = matchLines(oldLines, newLines);
  const edits: Edit[] = [];
  let j = 0;
  for (let i = 0; i <= oldLines.length; i += 1) {
    const target = i < oldLines.length ? (matches[i] ?? -1) : newLines.length;
    if (i < oldLines.length && target === -1) {
      edits.push({ type: "remove", text: oldLines[i] ?? "", oldLine: i + 1, newLine: j + 1 });
      continue;
    }
    for (; j < target; j += 1) {
      edits.push({ type: "add", text: newLines[j] ?? "", oldLine: i + 1, newLine: j + 1 });
    }
    if (i < oldLines.length) {
      edits.push({ type: "context", text: oldLines[i] ?? "", oldLine: i + 1, newLine: j + 1 });
      j += 1;
    }
  }
  return edits;
}

/** Groups changes with up to three lines of context around each, merging hunks that touch. */
export function diffHunks(before: string, after: string): GitDiffHunk[] {
  const edits = editScript(before, after);
  const changed = edits.flatMap((edit, index) => (edit.type === "context" ? [] : [index]));
  if (changed.length === 0) return [];

  const ranges: [number, number][] = [];
  for (const index of changed) {
    const start = Math.max(0, index - CONTEXT);
    const end = Math.min(edits.length - 1, index + CONTEXT);
    const last = ranges.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }

  return ranges.map(([start, end]) => {
    const slice = edits.slice(start, end + 1);
    const first = slice[0];
    const oldLines = slice.filter((edit) => edit.type !== "add").length;
    const newLines = slice.filter((edit) => edit.type !== "remove").length;
    return {
      // Git numbers an empty side from 0 (`@@ -0,0 +1,2 @@` for a new file).
      oldStart: oldLines === 0 ? (first?.oldLine ?? 1) - 1 : (first?.oldLine ?? 1),
      oldLines,
      newStart: newLines === 0 ? (first?.newLine ?? 1) - 1 : (first?.newLine ?? 1),
      newLines,
      lines: slice.map(({ type, text }) => ({ type, text })),
    };
  });
}

export function diffFile(change: FileChange): GitFileDiff {
  const kind = change.before === null ? "added" : change.after === null ? "deleted" : "modified";
  const before = change.before ?? "";
  const after = change.after ?? "";
  return {
    path: change.path,
    change: kind,
    hunks: diffHunks(before, after),
    ...lineStats(before, after),
  };
}

function range(start: number, count: number): string {
  return count === 1 ? String(start) : `${String(start)},${String(count)}`;
}

const PREFIX: Record<GitDiffLine["type"], string> = { context: " ", add: "+", remove: "-" };

/**
 * Git's unified diff for one file:
 *
 *   diff --git a/README.md b/README.md
 *   index 1a2b3c4..5d6e7f8 100644
 *   --- a/README.md
 *   +++ b/README.md
 *   @@ -1,2 +1,3 @@
 */
export function formatFileDiff(diff: GitFileDiff, oids: { before: string; after: string }): string {
  const short = (oid: string) => oid.slice(0, 7);
  const header = [`diff --git a/${diff.path} b/${diff.path}`];
  if (diff.change === "added") {
    header.push("new file mode 100644", `index 0000000..${short(oids.after)}`);
  } else if (diff.change === "deleted") {
    header.push("deleted file mode 100644", `index ${short(oids.before)}..0000000`);
  } else {
    header.push(`index ${short(oids.before)}..${short(oids.after)} 100644`);
  }
  header.push(
    diff.change === "added" ? "--- /dev/null" : `--- a/${diff.path}`,
    diff.change === "deleted" ? "+++ /dev/null" : `+++ b/${diff.path}`,
  );
  const body = diff.hunks.flatMap((hunk) => [
    `@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@`,
    ...hunk.lines.flatMap((line) => {
      const text = `${PREFIX[line.type]}${line.text.replace(/\n$/, "")}`;
      return line.text.endsWith("\n") ? [text] : [text, "\\ No newline at end of file"];
    }),
  ]);
  return [...header, ...body].join("\n");
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

  return [
    ...rows.map((row) =>
      ` ${row.path.padEnd(nameWidth)} | ${String(row.insertions + row.deletions).padStart(countWidth)} ${bar(row.insertions, "+")}${bar(row.deletions, "-")}`.trimEnd(),
    ),
    ...formatChangeSummary(changes),
  ];
}

/** ` 2 files changed, 3 insertions(+), 1 deletion(-)` plus create/delete mode lines. */
export function formatChangeSummary(changes: readonly FileChange[]): string[] {
  if (changes.length === 0) return [];
  let insertions = 0;
  let deletions = 0;
  for (const change of changes) {
    const stats = lineStats(change.before ?? "", change.after ?? "");
    insertions += stats.insertions;
    deletions += stats.deletions;
  }
  const summary = [`${String(changes.length)} file${changes.length === 1 ? "" : "s"} changed`];
  if (insertions > 0)
    summary.push(`${String(insertions)} insertion${insertions === 1 ? "" : "s"}(+)`);
  if (deletions > 0) summary.push(`${String(deletions)} deletion${deletions === 1 ? "" : "s"}(-)`);
  return [
    ` ${summary.join(", ")}`,
    ...changes.flatMap((change) => {
      if (change.before === null) return [` create mode 100644 ${change.path}`];
      if (change.after === null) return [` delete mode 100644 ${change.path}`];
      return [];
    }),
  ];
}
