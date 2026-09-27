"use client";

import { Badge, cn, Tooltip } from "@gitdojo/ui";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import {
  COMMIT_DOT_CENTER_X,
  COMMIT_NODE_WIDTH,
  type CommitFlowNode,
} from "../services/build-commit-graph";

const HANDLE_STYLE = { left: COMMIT_DOT_CENTER_X, opacity: 0, pointerEvents: "none" } as const;

/** Selection is handled by the graph's `onNodeClick`; the button provides focus and keyboard access. */
export function CommitNode({ data }: NodeProps<CommitFlowNode>) {
  const { commit, isHead, branches, selected, latest } = data;

  return (
    <div style={{ width: COMMIT_NODE_WIDTH }} className={cn(latest && "animate-gd-pop")}>
      <Handle type="target" position={Position.Top} isConnectable={false} style={HANDLE_STYLE} />
      {branches.length > 0 || isHead ? (
        <div className="mb-1 flex items-center gap-1 pl-1">
          {branches.map((branch) => (
            <Badge key={branch} tone="branch" mono>
              <GitBranch aria-hidden="true" />
              {branch}
            </Badge>
          ))}
          {isHead ? (
            <Tooltip content="HEAD points to the commit or branch you currently have checked out.">
              <span tabIndex={0} className="nopan inline-flex rounded-sm">
                <Badge tone="accent">HEAD</Badge>
              </span>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="commit-node"
        aria-label={`Commit ${commit.shortOid}: ${commit.message}`}
        aria-pressed={selected}
        className={cn(
          "nopan flex w-full cursor-pointer items-center gap-3 rounded-md border bg-panel px-3 py-2 text-left transition-colors duration-150",
          selected ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 rounded-full border-2",
            isHead
              ? "border-accent bg-accent ring-4 ring-accent-soft"
              : "border-fg-muted bg-elevated",
          )}
        />
        <span className="min-w-0">
          <span className="block font-mono text-caption text-warning">{commit.shortOid}</span>
          <span className="block truncate text-small text-fg">{commit.message}</span>
        </span>
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} style={HANDLE_STYLE} />
    </div>
  );
}
