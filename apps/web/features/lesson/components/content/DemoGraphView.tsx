import { type DemoGraph } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { RefLabels } from "@/features/repository/components/RefLabels";
import {
  assignLanes,
  laneColor,
  laneEdgePath,
  MERGE_COLOR,
  tipsInLaneOrder,
} from "@/features/repository/services/lanes";

const ROW_HEIGHT = 36;
const LANE_WIDTH = 22;
const RAIL_PADDING = 12;
const DOT_RADIUS = 6;

interface PlacedCommit {
  id: string;
  label: string;
  parents: string[];
  lane: number;
  row: number;
  branches: string[];
}

function parentsOf(commit: DemoGraph["commits"][number]): string[] {
  return [commit.parent, commit.merge].filter((id) => id !== undefined);
}

/** Where HEAD points: a branch (attached) or a commit id (detached). */
function resolveHead(graph: DemoGraph): { branch: string | null; commit: string | null } {
  const branches = graph.branches ?? {};
  if (graph.head === undefined) return { branch: null, commit: null };
  if (Object.hasOwn(branches, graph.head)) {
    return { branch: graph.head, commit: branches[graph.head] ?? null };
  }
  return { branch: null, commit: graph.head };
}

export function describeGraph(graph: DemoGraph): string {
  const byId = new Map(graph.commits.map((commit) => [commit.id, commit.message ?? commit.id]));
  const pointers = Object.entries(graph.branches ?? {}).map(
    ([branch, target]) => `${branch} points to "${byId.get(target) ?? target}"`,
  );
  const head = resolveHead(graph);
  const headText =
    head.branch !== null
      ? `HEAD points to ${head.branch}`
      : head.commit !== null
        ? `HEAD points directly to "${byId.get(head.commit) ?? head.commit}"`
        : null;
  return [
    `Commit graph with ${String(graph.commits.length)} commit${graph.commits.length === 1 ? "" : "s"}`,
    ...pointers,
    ...(headText ? [headText] : []),
  ].join(". ");
}

/**
 * A small, static commit graph for explanations: newest on top, one lane per line of work, with
 * branch and HEAD labels. Uses the same lane layout as the workspace's repository graph.
 */
export function DemoGraphView({ graph, className }: { graph: DemoGraph; className?: string }) {
  const newestFirst = [...graph.commits].reverse();
  const branches = Object.entries(graph.branches ?? {});
  const head = resolveHead(graph);
  const { lanes, laneCount } = assignLanes(
    newestFirst.map((commit) => ({ id: commit.id, parents: parentsOf(commit) })),
    tipsInLaneOrder(
      branches.map(([name, target]) => ({ name, target })),
      head.commit,
    ),
  );

  const placed: PlacedCommit[] = newestFirst.map((commit, row) => ({
    id: commit.id,
    label: commit.message ?? commit.id,
    parents: parentsOf(commit),
    lane: lanes.get(commit.id) ?? 0,
    row,
    branches: branches.filter(([, target]) => target === commit.id).map(([name]) => name),
  }));
  const byId = new Map(placed.map((commit) => [commit.id, commit]));
  const railWidth = RAIL_PADDING * 2 + (Math.max(laneCount, 1) - 1) * LANE_WIDTH;
  const point = (commit: PlacedCommit) => ({
    x: RAIL_PADDING + commit.lane * LANE_WIDTH,
    y: commit.row * ROW_HEIGHT + ROW_HEIGHT / 2,
  });

  return (
    <div
      role="img"
      aria-label={describeGraph(graph)}
      className={cn("relative overflow-x-auto", className)}
      data-testid="demo-graph"
    >
      <svg
        aria-hidden="true"
        className="absolute top-0 left-0"
        width={railWidth}
        height={placed.length * ROW_HEIGHT}
      >
        {placed.flatMap((commit) =>
          commit.parents.map((parentId, index) => {
            const parent = byId.get(parentId);
            if (!parent) return null;
            const merge = index > 0;
            return (
              <path
                key={`${commit.id}->${parent.id}`}
                d={laneEdgePath(
                  point(commit),
                  point(parent),
                  ROW_HEIGHT,
                  merge ? "child" : "parent",
                )}
                fill="none"
                stroke={laneColor(merge ? parent.lane : commit.lane)}
                strokeWidth={2}
              />
            );
          }),
        )}
        {placed.map((commit) => {
          const { x, y } = point(commit);
          const isHead = commit.id === head.commit;
          return (
            <circle
              key={commit.id}
              cx={x}
              cy={y}
              r={DOT_RADIUS}
              strokeWidth={2}
              stroke={
                isHead
                  ? "var(--accent-primary)"
                  : commit.parents.length > 1
                    ? MERGE_COLOR
                    : laneColor(commit.lane)
              }
              fill={isHead ? "var(--accent-primary)" : "var(--bg-panel)"}
            />
          );
        })}
      </svg>
      <ol aria-hidden="true" style={{ paddingLeft: railWidth + 4 }}>
        {placed.map((commit) => (
          <li
            key={commit.id}
            className="flex items-center gap-2 whitespace-nowrap"
            style={{ height: ROW_HEIGHT }}
          >
            <span className="text-small text-fg">{commit.label}</span>
            <RefLabels
              branches={commit.branches}
              isHead={commit.id === head.commit}
              currentBranch={head.branch}
              withTooltip={false}
              className="flex-nowrap"
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
