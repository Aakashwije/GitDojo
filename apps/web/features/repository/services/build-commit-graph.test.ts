import { EMPTY_REPOSITORY_STATE, type CommitState } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { buildCommitGraph, COMMIT_ROW_HEIGHT } from "./build-commit-graph";

const commit = (oid: string, parents: string[] = []): CommitState => ({
  oid,
  shortOid: oid.slice(0, 7),
  message: `commit ${oid}`,
  authorName: "GitDojo Learner",
  authorEmail: "learner@gitdojo.local",
  timestamp: 0,
  parents,
});

describe("buildCommitGraph", () => {
  it("returns an empty graph without commits", () => {
    expect(buildCommitGraph(EMPTY_REPOSITORY_STATE, null)).toEqual({ nodes: [], edges: [] });
  });

  it("lays commits out vertically with parent edges and branch labels", () => {
    const state = {
      ...EMPTY_REPOSITORY_STATE,
      initialized: true,
      currentBranch: "main",
      head: "bbbbbbbbbb",
      branches: [{ name: "main", oid: "bbbbbbbbbb", current: true }],
      commits: [commit("bbbbbbbbbb", ["aaaaaaaaaa"]), commit("aaaaaaaaaa")],
    };
    const { nodes, edges } = buildCommitGraph(state, "aaaaaaaaaa");
    expect(nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: COMMIT_ROW_HEIGHT },
    ]);
    expect(nodes[0]?.data).toMatchObject({
      isHead: true,
      branches: ["main"],
      selected: false,
      latest: true,
    });
    expect(nodes[1]?.data).toMatchObject({
      isHead: false,
      branches: [],
      selected: true,
      latest: false,
    });
    expect(edges).toEqual([
      expect.objectContaining({ source: "bbbbbbbbbb", target: "aaaaaaaaaa" }),
    ]);
  });
});
