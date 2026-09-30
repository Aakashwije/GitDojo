/**
 * Line-based diffing and three-way merging for small text files. Pure functions, so conflict
 * scenarios in lessons are deterministic.
 */

/** Splits text into lines, each keeping its trailing "\n" (the last line may lack one). */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/**
 * Longest common subsequence of two line arrays. Returns, for each line of `a`, the index of the
 * matching line in `b`, or -1. Matches are strictly increasing in both arrays.
 */
export function matchLines(a: readonly string[], b: readonly string[]): number[] {
  const width = b.length + 1;
  // lengths[i * width + j] = LCS length of a[i:] and b[j:]
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + j + 1] ?? 0);
    }
  }
  const matches = new Array<number>(a.length).fill(-1);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matches[i] = j;
      i += 1;
      j += 1;
    } else if ((lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

export interface LineStats {
  insertions: number;
  deletions: number;
}

export function lineStats(before: string, after: string): LineStats {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  const matched = matchLines(oldLines, newLines).filter((index) => index !== -1).length;
  return { insertions: newLines.length - matched, deletions: oldLines.length - matched };
}

export type MergeChunk =
  { kind: "ok"; lines: string[] } | { kind: "conflict"; ours: string[]; theirs: string[] };

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

/** Resolves one unstable region the way diff3 does: take the side that changed, if only one did. */
function resolveRegion(base: string[], ours: string[], theirs: string[]): MergeChunk[] {
  if (sameLines(ours, theirs) || sameLines(base, theirs)) return [{ kind: "ok", lines: ours }];
  if (sameLines(base, ours)) return [{ kind: "ok", lines: theirs }];

  // Both changed: keep lines they agree on at either end outside the conflict, like Git.
  let start = 0;
  while (start < ours.length && start < theirs.length && ours[start] === theirs[start]) start += 1;
  let end = 0;
  while (
    end < ours.length - start &&
    end < theirs.length - start &&
    ours[ours.length - 1 - end] === theirs[theirs.length - 1 - end]
  ) {
    end += 1;
  }
  const chunks: MergeChunk[] = [];
  if (start > 0) chunks.push({ kind: "ok", lines: ours.slice(0, start) });
  chunks.push({
    kind: "conflict",
    ours: ours.slice(start, ours.length - end),
    theirs: theirs.slice(start, theirs.length - end),
  });
  if (end > 0) chunks.push({ kind: "ok", lines: ours.slice(ours.length - end) });
  return chunks;
}

/**
 * Classic diff3: lines of `base` that survive unchanged in both `ours` and `theirs` anchor the
 * merge; the regions between anchors are taken from whichever side changed them, or reported as
 * conflicts when both sides changed them differently.
 */
export function mergeLines(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
): MergeChunk[] {
  const toOurs = matchLines(base, ours);
  const toTheirs = matchLines(base, theirs);
  const chunks: MergeChunk[] = [];
  const push = (chunk: MergeChunk) => {
    const empty = chunk.kind === "ok" && chunk.lines.length === 0;
    if (!empty) chunks.push(chunk);
  };

  let b = 0;
  let o = 0;
  let t = 0;
  while (b <= base.length) {
    // Next base line kept by both sides.
    let anchor = b;
    while (anchor < base.length && ((toOurs[anchor] ?? -1) < 0 || (toTheirs[anchor] ?? -1) < 0)) {
      anchor += 1;
    }
    const oEnd = anchor < base.length ? (toOurs[anchor] ?? ours.length) : ours.length;
    const tEnd = anchor < base.length ? (toTheirs[anchor] ?? theirs.length) : theirs.length;
    for (const chunk of resolveRegion(
      base.slice(b, anchor),
      ours.slice(o, oEnd),
      theirs.slice(t, tEnd),
    )) {
      push(chunk);
    }
    if (anchor >= base.length) break;
    push({ kind: "ok", lines: [base[anchor] ?? ""] });
    b = anchor + 1;
    o = oEnd + 1;
    t = tEnd + 1;
  }

  // Join neighbouring clean chunks.
  return chunks.reduce<MergeChunk[]>((merged, chunk) => {
    const previous = merged.at(-1);
    if (previous?.kind === "ok" && chunk.kind === "ok") previous.lines.push(...chunk.lines);
    else merged.push(chunk.kind === "ok" ? { kind: "ok", lines: [...chunk.lines] } : chunk);
    return merged;
  }, []);
}

export interface TextMergeResult {
  text: string;
  conflicts: number;
}

function terminated(lines: readonly string[]): string {
  const text = lines.join("");
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Three-way merges file contents. Conflicting regions are written with Git's markers:
 *
 *   <<<<<<< HEAD
 *   current branch
 *   =======
 *   incoming branch
 *   >>>>>>> feature/login
 */
export function mergeText(
  base: string,
  ours: string,
  theirs: string,
  labels: { ours: string; theirs: string },
): TextMergeResult {
  const chunks = mergeLines(splitLines(base), splitLines(ours), splitLines(theirs));
  let conflicts = 0;
  const text = chunks
    .map((chunk) => {
      if (chunk.kind === "ok") return chunk.lines.join("");
      conflicts += 1;
      return [
        `<<<<<<< ${labels.ours}\n`,
        terminated(chunk.ours),
        "=======\n",
        terminated(chunk.theirs),
        `>>>>>>> ${labels.theirs}\n`,
      ].join("");
    })
    .join("");
  return { text, conflicts };
}

const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?: |$)/m;

/** True while a file still contains `<<<<<<<`, `=======` or `>>>>>>>` marker lines. */
export function hasConflictMarkers(text: string): boolean {
  return CONFLICT_MARKER.test(text);
}
