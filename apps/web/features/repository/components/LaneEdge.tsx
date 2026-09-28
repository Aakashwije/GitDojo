"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";
import { COMMIT_ROW_HEIGHT } from "../services/build-commit-graph";
import { laneEdgePath } from "../services/lanes";

/** Parent link that stays in its lane and bends into the parent's lane just above it. */
export function LaneEdge({ id, sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  const path = laneEdgePath(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    COMMIT_ROW_HEIGHT,
  );
  return <BaseEdge id={id} path={path} style={style} />;
}
