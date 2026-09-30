import { type CommitState, type RepositoryState } from "@gitdojo/shared-types";
import { type Edge, type Node } from "@xyflow/react";
import { assignLanes, laneColor, tipsInLaneOrder } from "./lanes";

export const COMMIT_ROW_HEIGHT = 76;
/** Space above each commit card for its branch / HEAD labels. */
export const LABEL_ROW_HEIGHT = 26;
export const COMMIT_CARD_HEIGHT = 44;
export const COMMIT_CARD_WIDTH = 232;
export const LANE_WIDTH = 22;
/** Left edge to the centre of lane 0. */
export const RAIL_PADDING = 12;
/** Vertical centre of the commit dot inside a node; edges attach here. */
export const COMMIT_DOT_CENTER_Y = LABEL_ROW_HEIGHT + COMMIT_CARD_HEIGHT / 2;

export function laneCenterX(lane: number): number {
  return RAIL_PADDING + lane * LANE_WIDTH;
}

export interface CommitNodeData extends Record<string, unknown> {
  commit: CommitState;
  /** HEAD points at this commit (through a branch, or detached). */
  isHead: boolean;
  /** HEAD's branch, when HEAD is attached to one. */
  currentBranch: string | null;
  branches: string[];
  selected: boolean;
  /** True for the newest commit, which animates in when created. */
  latest: boolean;
  lane: number;
  /** Width of the lane rail; commit cards start after it so they line up. */
  railWidth: number;
  /** Has more than one parent. */
  isMerge: boolean;
}

export type CommitFlowNode = Node<CommitNodeData, "commit">;

export interface CommitGraph {
  nodes: CommitFlowNode[];
  edges: Edge[];
  laneCount: number;
}

/**
 * Vertical graph of every commit on every branch: newest on top, one row per commit, one lane
 * (column) per line of work, and edges from each commit to its parents.
 */
export function buildCommitGraph(state: RepositoryState, selectedOid: string | null): CommitGraph {
  const commits = state.allCommits;
  const { lanes, laneCount } = assignLanes(
    commits.map((commit) => ({ id: commit.oid, parents: commit.parents })),
    tipsInLaneOrder(
      state.branches.map((branch) => ({ name: branch.name, target: branch.oid })),
      state.head,
    ),
  );
  const railWidth = laneCenterX(Math.max(laneCount, 1) - 1) + RAIL_PADDING;
  const laneOf = (oid: string) => lanes.get(oid) ?? 0;

  const nodes: CommitFlowNode[] = commits.map((commit, index) => ({
    id: commit.oid,
    type: "commit",
    position: { x: 0, y: index * COMMIT_ROW_HEIGHT },
    draggable: false,
    selectable: false,
    data: {
      commit,
      isHead: commit.oid === state.head,
      currentBranch: state.currentBranch,
      branches: state.branches
        .filter((branch) => branch.oid === commit.oid)
        .map((branch) => branch.name),
      selected: commit.oid === selectedOid,
      latest: index === 0,
      lane: laneOf(commit.oid),
      railWidth,
      isMerge: commit.parents.length > 1,
    },
  }));

  const known = new Set(commits.map((commit) => commit.oid));
  const edges: Edge[] = commits.flatMap((commit) =>
    commit.parents
      .filter((parent) => known.has(parent))
      .map((parent, index) => {
        const merge = index > 0;
        return {
          id: `${commit.oid}->${parent}`,
          source: commit.oid,
          target: parent,
          type: "lane",
          data: { bend: merge ? "child" : "parent" },
          // A line takes the color of the branch it belongs to: the child's lane for first
          // parents, the incoming branch's lane for merges.
          style: { stroke: laneColor(laneOf(merge ? parent : commit.oid)), strokeWidth: 2 },
        };
      }),
  );

  return { nodes, edges, laneCount };
}
