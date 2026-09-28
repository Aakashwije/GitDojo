"use client";

import { cn } from "@gitdojo/ui";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  COMMIT_CARD_HEIGHT,
  COMMIT_CARD_WIDTH,
  COMMIT_DOT_CENTER_Y,
  COMMIT_ROW_HEIGHT,
  LABEL_ROW_HEIGHT,
  laneCenterX,
  type CommitFlowNode,
} from "../services/build-commit-graph";
import { laneColor } from "../services/lanes";
import { RefLabels } from "./RefLabels";

const DOT_SIZE = 14;

/** Edges attach at the dot's centre, so lines run through the dots of the lane rail. */
function handleStyle(x: number) {
  return {
    left: x,
    top: COMMIT_DOT_CENTER_Y,
    bottom: "auto",
    width: 1,
    height: 1,
    minWidth: 0,
    minHeight: 0,
    border: 0,
    transform: "translate(-50%, -50%)",
    opacity: 0,
    pointerEvents: "none",
  } as const;
}

/**
 * One row of the graph: the commit's dot in its lane on the left rail, and a card to the right.
 * Selection is handled by the graph's `onNodeClick`; the button provides focus and keyboard access.
 */
export function CommitNode({ data }: NodeProps<CommitFlowNode>) {
  const { commit, isHead, currentBranch, branches, selected, latest, lane, railWidth } = data;
  const dotX = laneCenterX(lane);

  return (
    <div
      style={{ width: railWidth + COMMIT_CARD_WIDTH, height: COMMIT_ROW_HEIGHT }}
      // The pop animation goes on the dot and card, never on this wrapper: React Flow measures
      // the handles inside it, and a scaled wrapper would skew where edges attach.
      className="relative"
      data-testid="commit-row"
      data-lane={lane}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={handleStyle(dotX)}
      />
      <div
        className="absolute flex items-end pb-1"
        style={{ left: railWidth, height: LABEL_ROW_HEIGHT }}
      >
        <RefLabels branches={branches} isHead={isHead} currentBranch={currentBranch} />
      </div>
      <span
        aria-hidden="true"
        data-testid={isHead ? "head-commit-dot" : undefined}
        className={cn(
          "absolute rounded-full border-2",
          latest && "animate-gd-pop",
          isHead ? "border-accent bg-accent ring-4 ring-accent-soft" : "bg-panel",
        )}
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          left: dotX - DOT_SIZE / 2,
          top: COMMIT_DOT_CENTER_Y - DOT_SIZE / 2,
          ...(isHead ? {} : { borderColor: laneColor(lane) }),
        }}
      />
      <button
        type="button"
        data-testid="commit-node"
        aria-label={`Commit ${commit.shortOid}: ${commit.message}${
          branches.length > 0 ? ` (${branches.join(", ")})` : ""
        }${isHead ? " (HEAD)" : ""}`}
        aria-pressed={selected}
        style={{
          position: "absolute",
          left: railWidth,
          top: LABEL_ROW_HEIGHT,
          width: COMMIT_CARD_WIDTH,
          height: COMMIT_CARD_HEIGHT,
        }}
        className={cn(
          "nopan flex cursor-pointer flex-col justify-center rounded-md border bg-panel px-3 text-left transition-colors duration-150",
          latest && "animate-gd-pop",
          selected ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
        )}
      >
        <span className="block font-mono text-caption leading-tight text-warning">
          {commit.shortOid}
        </span>
        <span className="block truncate text-small leading-tight text-fg">{commit.message}</span>
      </button>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={handleStyle(dotX)}
      />
    </div>
  );
}
