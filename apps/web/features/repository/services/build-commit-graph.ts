import { type CommitState, type RepositoryState } from "@gitdojo/shared-types";
import { type Edge, type Node } from "@xyflow/react";

export const COMMIT_ROW_HEIGHT = 84;
export const COMMIT_NODE_WIDTH = 232;
/** Horizontal centre of the commit dot inside a node; edges attach here. */
export const COMMIT_DOT_CENTER_X = 20;

export interface CommitNodeData extends Record<string, unknown> {
  commit: CommitState;
  isHead: boolean;
  branches: string[];
  selected: boolean;
  /** True for the newest commit, which animates in when created. */
  latest: boolean;
}

export type CommitFlowNode = Node<CommitNodeData, "commit">;

export interface CommitGraph {
  nodes: CommitFlowNode[];
  edges: Edge[];
}

/** Simple vertical layout: newest commit on top, one row per commit, edges to parents. */
export function buildCommitGraph(state: RepositoryState, selectedOid: string | null): CommitGraph {
  const known = new Set(state.commits.map((commit) => commit.oid));

  const nodes: CommitFlowNode[] = state.commits.map((commit, index) => ({
    id: commit.oid,
    type: "commit",
    position: { x: 0, y: index * COMMIT_ROW_HEIGHT },
    draggable: false,
    selectable: false,
    data: {
      commit,
      isHead: commit.oid === state.head,
      branches: state.branches
        .filter((branch) => branch.oid === commit.oid)
        .map((branch) => branch.name),
      selected: commit.oid === selectedOid,
      latest: index === 0,
    },
  }));

  const edges: Edge[] = state.commits.flatMap((commit) =>
    commit.parents
      .filter((parent) => known.has(parent))
      .map((parent) => ({
        id: `${commit.oid}->${parent}`,
        source: commit.oid,
        target: parent,
        type: "straight",
        style: { stroke: "var(--border-strong)", strokeWidth: 2 },
      })),
  );

  return { nodes, edges };
}
