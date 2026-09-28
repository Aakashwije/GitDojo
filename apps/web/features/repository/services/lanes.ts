/** Minimal commit shape for lane layout; works for real commits and hand-authored demo graphs. */
export interface LaneCommit {
  id: string;
  parents: readonly string[];
}

export interface LaneLayout {
  /** Commit id → lane (column), starting at 0. */
  lanes: Map<string, number>;
  laneCount: number;
}

/**
 * Assigns each commit a lane, git-graph style. Each tip (in priority order) claims its
 * first-parent chain down to the first commit already claimed, so the default branch keeps a
 * straight line in lane 0 and every branch with commits of its own gets one extra lane.
 * A branch pointing at a commit that is already claimed (e.g. just created) needs no lane.
 *
 * `commits` must list children before parents.
 */
export function assignLanes(commits: readonly LaneCommit[], tips: readonly string[]): LaneLayout {
  const byId = new Map(commits.map((commit) => [commit.id, commit]));
  const lanes = new Map<string, number>();
  let laneCount = 0;

  const claim = (tip: string) => {
    if (!byId.has(tip) || lanes.has(tip)) return;
    const lane = laneCount;
    laneCount += 1;
    let id: string | undefined = tip;
    while (id !== undefined && byId.has(id) && !lanes.has(id)) {
      lanes.set(id, lane);
      id = byId.get(id)?.parents[0];
    }
  };

  for (const tip of tips) claim(tip);
  // Anything left (e.g. second parents of merges) gets its own lane.
  for (const commit of commits) claim(commit.id);
  return { lanes, laneCount };
}

const DEFAULT_BRANCHES = ["main", "master"];

/**
 * Branch tips in lane priority order: the default branch first, then the others by name. The
 * order ignores which branch is checked out, so switching never reshuffles the graph.
 */
export function tipsInLaneOrder(
  branches: readonly { name: string; target: string | null }[],
  head: string | null,
): string[] {
  const rank = (name: string) => {
    const index = DEFAULT_BRANCHES.indexOf(name);
    return index === -1 ? DEFAULT_BRANCHES.length : index;
  };
  const ordered = [...branches].sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
  );
  const tips = ordered.map((branch) => branch.target).filter((target) => target !== null);
  return head === null ? tips : [...tips, head];
}

/** One color per lane. Lane 0 is neutral; branches use Git accents from UI.md. */
export const LANE_COLORS = [
  "var(--text-muted)",
  "var(--accent-secondary)",
  "var(--purple)",
  "var(--success)",
  "var(--info)",
] as const;

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0];
}

/**
 * SVG path for an edge from a child commit down to its parent. It stays in the child's lane and
 * bends into the parent's lane just above the parent, so it never crosses commits in between.
 */
export function laneEdgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rowHeight: number,
): string {
  if (from.x === to.x)
    return `M ${String(from.x)} ${String(from.y)} L ${String(to.x)} ${String(to.y)}`;
  const bendStart = Math.max(from.y, to.y - rowHeight);
  const middle = (bendStart + to.y) / 2;
  return [
    `M ${String(from.x)} ${String(from.y)}`,
    `L ${String(from.x)} ${String(bendStart)}`,
    `C ${String(from.x)} ${String(middle)} ${String(to.x)} ${String(middle)} ${String(to.x)} ${String(to.y)}`,
  ].join(" ");
}
