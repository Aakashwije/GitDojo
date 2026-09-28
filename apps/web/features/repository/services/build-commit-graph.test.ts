import {
  EMPTY_REPOSITORY_STATE,
  type CommitState,
  type RepositoryState,
} from "@gitdojo/shared-types";
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
    expect(buildCommitGraph(EMPTY_REPOSITORY_STATE, null)).toEqual({
      nodes: [],
      edges: [],
      laneCount: 0,
    });
  });

  it("lays commits out vertically with parent edges and branch labels", () => {
    const history = [commit("bbbbbbbbbb", ["aaaaaaaaaa"]), commit("aaaaaaaaaa")];
    const state: RepositoryState = {
      ...EMPTY_REPOSITORY_STATE,
      initialized: true,
      currentBranch: "main",
      head: "bbbbbbbbbb",
      branches: [{ name: "main", oid: "bbbbbbbbbb", current: true }],
      commits: history,
      allCommits: history,
    };
    const { nodes, edges, laneCount } = buildCommitGraph(state, "aaaaaaaaaa");
    expect(laneCount).toBe(1);
    expect(nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: COMMIT_ROW_HEIGHT },
    ]);
    expect(nodes[0]?.data).toMatchObject({
      isHead: true,
      currentBranch: "main",
      branches: ["main"],
      selected: false,
      latest: true,
      lane: 0,
    });
    expect(nodes[1]?.data).toMatchObject({
      isHead: false,
      branches: [],
      selected: true,
      latest: false,
      lane: 0,
    });
    expect(edges).toEqual([
      expect.objectContaining({ source: "bbbbbbbbbb", target: "aaaaaaaaaa", type: "lane" }),
    ]);
  });

  it("shows commits on every branch, each line of work in its own lane", () => {
    // main → B; feature/login → C (child of B); HEAD on main.
    const a = commit("aaaaaaaaaa");
    const b = commit("bbbbbbbbbb", [a.oid]);
    const c = commit("cccccccccc", [b.oid]);
    const state: RepositoryState = {
      ...EMPTY_REPOSITORY_STATE,
      initialized: true,
      currentBranch: "main",
      head: b.oid,
      branches: [
        { name: "feature/login", oid: c.oid, current: false },
        { name: "main", oid: b.oid, current: true },
      ],
      commits: [b, a],
      allCommits: [c, b, a],
    };
    const { nodes, edges, laneCount } = buildCommitGraph(state, null);
    expect(laneCount).toBe(2);
    expect(nodes.map((node) => [node.data.commit.oid, node.data.lane, node.data.branches])).toEqual(
      [
        [c.oid, 1, ["feature/login"]],
        [b.oid, 0, ["main"]],
        [a.oid, 0, []],
      ],
    );
    expect(nodes.find((node) => node.data.isHead)?.id).toBe(b.oid);
    // Every node reserves the same rail, so commit cards line up.
    expect(new Set(nodes.map((node) => node.data.railWidth)).size).toBe(1);
    expect(edges.map((edge) => edge.id)).toEqual([`${c.oid}->${b.oid}`, `${b.oid}->${a.oid}`]);
  });
});
