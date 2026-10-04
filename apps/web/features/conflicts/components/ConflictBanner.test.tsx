import { EMPTY_REPOSITORY_STATE, type MergeState } from "@gitdojo/shared-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRepositoryStore } from "@/features/repository/state/use-repository-store";
import { ConflictBanner } from "./ConflictBanner";

function show(merge: MergeState, resolved: boolean) {
  useRepositoryStore.getState().setRepositoryState({
    ...EMPTY_REPOSITORY_STATE,
    initialized: true,
    currentBranch: merge.kind === "rebase" ? null : "main",
    merge,
    conflicts: [{ path: "app.js", ours: "a", theirs: "b", base: "c", resolved }],
  });
  return render(<ConflictBanner />);
}

describe("ConflictBanner", () => {
  it.each([
    [{ kind: "merge", branch: "feature/login", oid: "a" }, "Merging feature/login into main."],
    [
      { kind: "revert", branch: "abc1234 (Add dark mode)", oid: "a" },
      "Reverting abc1234 (Add dark mode).",
    ],
    [
      { kind: "cherry-pick", branch: "abc1234 (Fix typo)", oid: "a" },
      "Cherry-picking abc1234 (Fix typo) onto main.",
    ],
    [
      {
        kind: "rebase",
        branch: "abc1234 (Add search)",
        oid: "a",
        rebase: { branch: "feature", onto: "b", remaining: 1 },
      },
      "Rebasing feature: replaying abc1234 (Add search).",
    ],
  ] as const)("describes a stopped %s", (merge, text) => {
    show(merge, false);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });

  it.each([
    ["merge", "git commit"],
    ["revert", "git revert --continue"],
    ["cherry-pick", "git cherry-pick --continue"],
    ["rebase", "git rebase --continue"],
  ] as const)("tells how to finish a %s once everything is resolved", (kind, command) => {
    show({ kind, branch: "x", oid: "a" }, true);
    expect(screen.getByRole("status")).toHaveTextContent(`Run ${command} to finish.`);
  });
});
