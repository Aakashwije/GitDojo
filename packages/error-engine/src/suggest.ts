/** Levenshtein edit distance between two short strings. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * Candidates close to `typed` (a likely typo), closest first. Case differences count as close,
 * because learners often type `Main` or `readme.md`.
 */
export function closestMatches(typed: string, candidates: Iterable<string>, limit = 3): string[] {
  const needle = typed.toLowerCase();
  const maximum = Math.max(1, Math.min(3, Math.floor(needle.length / 3)));
  return [...new Set(candidates)]
    .filter((candidate) => candidate !== typed)
    .map((candidate) => ({ candidate, distance: editDistance(needle, candidate.toLowerCase()) }))
    .filter(({ distance }) => distance <= maximum)
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
