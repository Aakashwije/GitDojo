export type ConflictLineKind =
  "plain" | "ours-marker" | "ours" | "separator" | "theirs" | "theirs-marker";

export interface ConflictLine {
  text: string;
  kind: ConflictLineKind;
}

const OURS_MARKER = /^<{7}(?: |$)/;
const SEPARATOR = /^={7}$/;
const THEIRS_MARKER = /^>{7}(?: |$)/;

/**
 * Tags each line of a file with its role in Git's conflict markers, so the editor can shade
 * "current" and "incoming" regions. Text outside a conflict block is "plain".
 */
export function classifyConflictLines(text: string): ConflictLine[] {
  let region: "plain" | "ours" | "theirs" = "plain";
  return text.split("\n").map((line) => {
    if (OURS_MARKER.test(line)) {
      region = "ours";
      return { text: line, kind: "ours-marker" };
    }
    if (region === "ours" && SEPARATOR.test(line)) {
      region = "theirs";
      return { text: line, kind: "separator" };
    }
    if (region === "theirs" && THEIRS_MARKER.test(line)) {
      region = "plain";
      return { text: line, kind: "theirs-marker" };
    }
    return { text: line, kind: region };
  });
}

/** Number of `<<<<<<<` … `>>>>>>>` blocks still in the text. */
export function countConflictBlocks(text: string): number {
  return classifyConflictLines(text).filter((line) => line.kind === "ours-marker").length;
}

/** True while any marker line remains, even a stray one. */
export function hasMarkerLines(text: string): boolean {
  return text
    .split("\n")
    .some((line) => OURS_MARKER.test(line) || SEPARATOR.test(line) || THEIRS_MARKER.test(line));
}
