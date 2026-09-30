"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";
import { COMMIT_ROW_HEIGHT } from "../services/build-commit-graph";
import { laneEdgePath } from "../services/lanes";

/** Parent link drawn along the lanes (see `laneEdgePath`). */
export function LaneEdge({ id, sourceX, sourceY, targetX, targetY, style, data }: EdgeProps) {
  const path = laneEdgePath(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    COMMIT_ROW_HEIGHT,
    data?.bend === "child" ? "child" : "parent",
  );
  return <BaseEdge id={id} path={path} style={style} />;
}
