/** Shell-style history navigation. Pure data structure; the store persists the entries. */
export interface HistoryCursor {
  /** Index into entries while navigating, or `null` when editing a fresh line. */
  index: number | null;
  /** The line being typed before navigation began, restored when navigating past the end. */
  draft: string;
}

export const INITIAL_HISTORY_CURSOR: HistoryCursor = { index: null, draft: "" };

export interface HistoryStep {
  cursor: HistoryCursor;
  line: string;
}

export function previousEntry(
  entries: readonly string[],
  cursor: HistoryCursor,
  currentLine: string,
): HistoryStep | null {
  if (entries.length === 0) return null;
  if (cursor.index === null) {
    const index = entries.length - 1;
    return { cursor: { index, draft: currentLine }, line: entries[index] ?? "" };
  }
  if (cursor.index === 0) return null;
  const index = cursor.index - 1;
  return { cursor: { ...cursor, index }, line: entries[index] ?? "" };
}

export function nextEntry(entries: readonly string[], cursor: HistoryCursor): HistoryStep | null {
  if (cursor.index === null) return null;
  if (cursor.index >= entries.length - 1) {
    return { cursor: INITIAL_HISTORY_CURSOR, line: cursor.draft };
  }
  const index = cursor.index + 1;
  return { cursor: { ...cursor, index }, line: entries[index] ?? "" };
}

/** Appends a command, skipping blanks and immediate duplicates (like `HISTCONTROL=ignoredups`). */
export function appendEntry(entries: readonly string[], line: string, limit = 200): string[] {
  const trimmed = line.trim();
  if (trimmed === "" || entries.at(-1) === trimmed) return [...entries];
  return [...entries, trimmed].slice(-limit);
}
