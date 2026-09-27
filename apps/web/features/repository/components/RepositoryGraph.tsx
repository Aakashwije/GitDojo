"use client";

import "@xyflow/react/dist/style.css";

import { Badge } from "@gitdojo/ui";
import { ReactFlow, type NodeTypes } from "@xyflow/react";
import { FolderGit2, GitBranch } from "lucide-react";
import { useMemo } from "react";
import { buildCommitGraph } from "../services/build-commit-graph";
import { useRepositoryStore } from "../state/use-repository-store";
import { CommitDetails } from "./CommitDetails";
import { CommitNode } from "./CommitNode";
import { EmptyState } from "./EmptyState";

const nodeTypes = { commit: CommitNode } satisfies NodeTypes;
const FIT_VIEW_OPTIONS = { padding: 0.3, maxZoom: 1, minZoom: 0.4 };

function EmptyGraph() {
  const repository = useRepositoryStore((state) => state.repositoryState);
  if (!repository.initialized) {
    return (
      <EmptyState icon={FolderGit2} title="Not a Git repository">
        Run <code className="gd-code">git init</code> to create one.
      </EmptyState>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      {repository.currentBranch ? (
        <Badge tone="branch" mono>
          <GitBranch aria-hidden="true" />
          {repository.currentBranch}
        </Badge>
      ) : null}
      <span
        aria-hidden="true"
        className="size-3.5 rounded-full border-2 border-dashed border-fg-faint"
      />
      <div>
        <p className="text-small font-medium text-fg-secondary">No commits yet</p>
        <p className="mt-1 max-w-60 text-caption text-fg-muted">
          <span className="font-mono">{repository.currentBranch ?? "main"}</span> will point to your
          first commit.
        </p>
      </div>
    </div>
  );
}

/** Vertical commit graph (React Flow). Clicking a commit shows its details. */
export function RepositoryGraph() {
  const repository = useRepositoryStore((state) => state.repositoryState);
  const selectedOid = useRepositoryStore((state) => state.selectedCommit);
  const selectCommit = useRepositoryStore((state) => state.selectCommit);
  const graph = useMemo(() => buildCommitGraph(repository, selectedOid), [repository, selectedOid]);
  const selected = repository.commits.find((commit) => commit.oid === selectedOid);

  if (graph.nodes.length === 0) return <EmptyGraph />;

  return (
    <div className="flex h-full flex-col" data-testid="commit-graph">
      <div className="min-h-0 flex-1">
        <ReactFlow
          // Re-fit when commits are added or the details pane changes the canvas size;
          // remounting is cheaper than tracking viewport state.
          key={`${String(graph.nodes.length)}:${selected ? "details" : "full"}`}
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_event, node) => {
            selectCommit(node.id === selectedOid ? null : node.id);
          }}
          colorMode="dark"
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: false }}
          aria-label="Commit graph"
        />
      </div>
      {selected ? (
        <div className="max-h-[60%] shrink-0 overflow-auto border-t border-border-subtle p-3">
          <CommitDetails
            commit={selected}
            onClose={() => {
              selectCommit(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
