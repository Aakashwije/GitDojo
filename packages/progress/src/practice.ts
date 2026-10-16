/** A practice task as "Surprise me" sees it: an id, and the commands it still lacks. */
export interface SurpriseCandidate {
  id: string;
  /** Commands GitDojo cannot run yet; such a task is locked and never picked. */
  missingCommands: readonly string[];
}

export interface SurpriseOptions {
  /** Task id → when it was first solved (ms), as in `LocalProgress.completedPractice`. */
  solved: Readonly<Record<string, { completedAt: number }>>;
  /** The task the learner is on now, if any: never picked again straight away. */
  current?: string;
  /**
   * Any integer; the same seed with the same progress always picks the same task. The browser
   * passes a counter, so pressing "Surprise me" again moves on to another task.
   */
  seed: number;
}

/**
 * "Surprise me": a deterministic pick among `tasks` (already filtered by topic or difficulty).
 * Unsolved tasks come first; the current task and the most recently solved one are skipped
 * whenever anything else is eligible. Returns `null` only when nothing is playable.
 */
export function pickSurpriseTask<T extends SurpriseCandidate>(
  tasks: readonly T[],
  { solved, current, seed }: SurpriseOptions,
): T | null {
  const playable = tasks.filter((task) => task.missingCommands.length === 0);
  if (playable.length === 0) return null;
  let latest: { id: string; at: number } | null = null;
  for (const [id, record] of Object.entries(solved)) {
    if (latest === null || record.completedAt > latest.at) latest = { id, at: record.completedAt };
  }
  const recent = new Set([current, latest?.id].filter((id) => id !== undefined));
  const fresh = playable.filter((task) => !recent.has(task.id));
  const unsolved = fresh.filter((task) => solved[task.id] === undefined);
  const pool = unsolved.length > 0 ? unsolved : fresh.length > 0 ? fresh : playable;
  const index = Math.abs(Math.trunc(seed)) % pool.length;
  return pool[index] ?? null;
}
