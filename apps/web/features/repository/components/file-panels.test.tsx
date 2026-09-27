import { EMPTY_REPOSITORY_STATE } from "@gitdojo/shared-types";
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRepositoryStore } from "../state/use-repository-store";
import { StagingAreaPanel } from "./StagingAreaPanel";
import { WorkingTreePanel } from "./WorkingTreePanel";

describe("working tree and staging panels", () => {
  beforeEach(() => {
    useRepositoryStore.getState().setWorkspace("test");
  });

  it("moves README.md from the working tree to the staging area", () => {
    render(
      <>
        <WorkingTreePanel />
        <StagingAreaPanel />
      </>,
    );
    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...EMPTY_REPOSITORY_STATE,
        initialized: true,
        files: [{ path: "README.md", status: "untracked" }],
      });
    });
    const workingTree = screen.getByTestId("working-tree-panel");
    expect(within(workingTree).getByText("README.md")).toBeInTheDocument();
    expect(within(workingTree).getByText("Untracked")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("staging-area-panel")).getByText("No staged changes"),
    ).toBeInTheDocument();

    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...EMPTY_REPOSITORY_STATE,
        initialized: true,
        files: [{ path: "README.md", status: "staged" }],
        stagedFiles: [{ path: "README.md", status: "staged", change: "added" }],
      });
    });
    expect(within(workingTree).getByText("No unstaged changes")).toBeInTheDocument();
    const staging = screen.getByTestId("staging-area-panel");
    expect(within(staging).getByText("README.md")).toBeInTheDocument();
    expect(within(staging).getByText("Staged · New file")).toBeInTheDocument();
  });
});
