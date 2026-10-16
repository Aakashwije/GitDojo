import { EMPTY_REPOSITORY_STATE, type CommitState } from "@gitdojo/shared-types";
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRepositoryStore } from "../state/use-repository-store";
import { RepositoryPanel } from "./RepositoryPanel";

const A = "a".repeat(40);
const B = "b".repeat(40);
const commit: CommitState = {
  oid: A,
  shortOid: A.slice(0, 7),
  message: "Initial commit",
  authorName: "GitDojo Learner",
  authorEmail: "learner@gitdojo.local",
  timestamp: 0,
  parents: [],
  changedPaths: [],
};

beforeEach(() => {
  useRepositoryStore.getState().setWorkspace("panel-test");
});

describe("RepositoryPanel", () => {
  it("lists tags and the simulated remote, saying whether origin/* is up to date", () => {
    render(<RepositoryPanel />);
    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...EMPTY_REPOSITORY_STATE,
        initialized: true,
        currentBranch: "main",
        head: A,
        commits: [commit],
        allCommits: [commit],
        branches: [{ name: "main", oid: A, current: true }],
        tags: [{ name: "v1.0", oid: A, annotated: true, message: "First release" }],
        remotes: [
          {
            name: "origin",
            url: "gitdojo://simulated/origin.git",
            branches: [
              { name: "main", oid: B },
              { name: "feature", oid: A },
            ],
          },
        ],
        remoteBranches: [{ name: "origin/main", remote: "origin", branch: "main", oid: A }],
      });
    });
    expect(within(screen.getByTestId("tag-list")).getByText("First release")).toBeInTheDocument();
    const remote = within(screen.getByTestId("remote-list"));
    expect(remote.getByText("origin · gitdojo://simulated/origin.git")).toBeInTheDocument();
    const rows = remote.getAllByTestId("remote-branch");
    expect(rows.find((row) => row.dataset.branch === "main")).toHaveTextContent(
      "origin/main is out of date: fetch to update it",
    );
    expect(rows.find((row) => row.dataset.branch === "feature")).toHaveTextContent(
      "not fetched yet",
    );
  });

  it("shows neither section for a repository without tags or remotes", () => {
    render(<RepositoryPanel />);
    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...EMPTY_REPOSITORY_STATE,
        initialized: true,
        head: A,
        commits: [commit],
        allCommits: [commit],
      });
    });
    expect(screen.queryByTestId("tag-list")).toBeNull();
    expect(screen.queryByTestId("remote-list")).toBeNull();
  });
});
