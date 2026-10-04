import {
  EMPTY_REPOSITORY_STATE,
  type CommitState,
  type LessonObjective,
  type RepositoryState,
  type ValidatorDefinition,
} from "@gitdojo/shared-types";
import { describe, expect, it, vi } from "vitest";
import { validatorRegistry } from "./registry";
import { validatorDefinitionSchema } from "./schema";
import { type ValidatorRegistry } from "./types";
import { validateLesson, validateObjective } from "./validate";

function commit(message: string, oid = "a".repeat(40)): CommitState {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    message,
    authorName: "GitDojo Learner",
    authorEmail: "learner@gitdojo.local",
    timestamp: 0,
    parents: [],
  };
}

function state(overrides: Partial<RepositoryState> = {}): RepositoryState {
  return { ...EMPTY_REPOSITORY_STATE, initialized: true, currentBranch: "main", ...overrides };
}

function check(validator: ValidatorDefinition, repository: RepositoryState) {
  const objective: LessonObjective = { id: "o", description: "d", validator };
  return validateObjective(objective, { repository });
}

describe("validators", () => {
  describe("repository_initialized", () => {
    it("passes when initialized", async () => {
      expect(await check({ type: "repository_initialized" }, state())).toEqual({ passed: true });
    });

    it("fails when not initialized", async () => {
      const result = await check({ type: "repository_initialized" }, EMPTY_REPOSITORY_STATE);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/not a Git repository/);
    });
  });

  describe("file_exists", () => {
    const repo = state({ files: [{ path: "README.md", status: "untracked" }] });

    it("passes for an existing file, accepting ./ prefixes", async () => {
      expect((await check({ type: "file_exists", file: "README.md" }, repo)).passed).toBe(true);
      expect((await check({ type: "file_exists", file: "./README.md" }, repo)).passed).toBe(true);
    });

    it("fails for missing or deleted files", async () => {
      expect((await check({ type: "file_exists", file: "other.md" }, repo)).passed).toBe(false);
      const deleted = state({ files: [{ path: "README.md", status: "deleted" }] });
      expect((await check({ type: "file_exists", file: "README.md" }, deleted)).passed).toBe(false);
    });

    it("works before git init", async () => {
      const uninitialized = { ...EMPTY_REPOSITORY_STATE, files: repo.files };
      expect((await check({ type: "file_exists", file: "README.md" }, uninitialized)).passed).toBe(
        true,
      );
    });
  });

  describe("file_staged", () => {
    it("passes when staged, regardless of how", async () => {
      const repo = state({
        files: [{ path: "README.md", status: "staged" }],
        stagedFiles: [{ path: "README.md", status: "staged", change: "added" }],
      });
      expect(await check({ type: "file_staged", file: "README.md" }, repo)).toEqual({
        passed: true,
      });
    });

    it("fails when only present in the working tree", async () => {
      const repo = state({ files: [{ path: "README.md", status: "untracked" }] });
      expect(await check({ type: "file_staged", file: "README.md" }, repo)).toEqual({
        passed: false,
        reason: "README.md is not staged.",
      });
    });
  });

  describe("file_committed / file_not_tracked", () => {
    const repo = state({
      files: [
        { path: "README.md", status: "committed" },
        { path: "app.js", status: "modified" },
        { path: "debug.log", status: "untracked" },
        { path: "new.js", status: "staged" },
      ],
      stagedFiles: [
        { path: "new.js", status: "staged", change: "added" },
        { path: "old.js", status: "staged", change: "deleted" },
      ],
    });

    it("file_committed passes only for unchanged committed files", async () => {
      expect((await check({ type: "file_committed", file: "README.md" }, repo)).passed).toBe(true);
      expect(await check({ type: "file_committed", file: "app.js" }, repo)).toEqual({
        passed: false,
        reason: "app.js has changes that are not committed.",
      });
      expect((await check({ type: "file_committed", file: "debug.log" }, repo)).reason).toBe(
        "debug.log has never been committed.",
      );
      expect((await check({ type: "file_committed", file: "nope" }, repo)).reason).toBe(
        "nope is not in the repository.",
      );
    });

    it("file_not_tracked passes for untracked, ignored, absent and removed files", async () => {
      for (const file of ["debug.log", "ignored.tmp", "old.js"]) {
        expect((await check({ type: "file_not_tracked", file }, repo)).passed).toBe(true);
      }
      for (const file of ["README.md", "app.js", "new.js"]) {
        expect(await check({ type: "file_not_tracked", file }, repo)).toEqual({
          passed: false,
          reason: `Git is tracking ${file}.`,
        });
      }
    });
  });

  describe("commit_exists", () => {
    it("fails without commits", async () => {
      expect((await check({ type: "commit_exists" }, state())).passed).toBe(false);
    });

    it("passes with any commit when no message is required", async () => {
      expect(
        (await check({ type: "commit_exists" }, state({ commits: [commit("x")] }))).passed,
      ).toBe(true);
    });

    it("matches the message when one is specified", async () => {
      const repo = state({ commits: [commit("Initial commit")] });
      const ok = await check({ type: "commit_exists", message: "Initial commit" }, repo);
      expect(ok.passed).toBe(true);
      const wrong = await check({ type: "commit_exists", message: "Other" }, repo);
      expect(wrong).toEqual({ passed: false, reason: 'No commit has the message "Other".' });
    });
  });

  describe("commit_count", () => {
    it("compares the number of commits", async () => {
      const repo = state({ commits: [commit("b", "b".repeat(40)), commit("a")] });
      expect((await check({ type: "commit_count", count: 2 }, repo)).passed).toBe(true);
      expect(await check({ type: "commit_count", count: 1 }, repo)).toEqual({
        passed: false,
        reason: "Expected 1 commit, found 2.",
      });
    });
  });

  describe("clean_worktree", () => {
    it("passes when everything is committed", async () => {
      const repo = state({
        commits: [commit("x")],
        files: [{ path: "README.md", status: "committed" }],
      });
      expect((await check({ type: "clean_worktree" }, repo)).passed).toBe(true);
    });

    it("fails with untracked, modified or staged files", async () => {
      const untracked = state({ files: [{ path: "a", status: "untracked" }] });
      expect((await check({ type: "clean_worktree" }, untracked)).passed).toBe(false);
      const staged = state({ stagedFiles: [{ path: "a", status: "staged", change: "added" }] });
      expect((await check({ type: "clean_worktree" }, staged)).passed).toBe(false);
    });

    it("fails before git init", async () => {
      expect((await check({ type: "clean_worktree" }, EMPTY_REPOSITORY_STATE)).passed).toBe(false);
    });
  });
});

describe("branch validators", () => {
  const A = "a".repeat(40);
  const B = "b".repeat(40);
  const C = "c".repeat(40);
  const commitA = { ...commit("Initial commit", A), parents: [] };
  const commitB = { ...commit("Add homepage", B), parents: [A] };
  const commitC = { ...commit("Add login", C), parents: [B] };

  // main → B, feature/login → C (one commit ahead), HEAD on main.
  const repo = state({
    head: B,
    branches: [
      { name: "feature/login", oid: C, current: false },
      { name: "main", oid: B, current: true },
    ],
    commits: [commitB, commitA],
    allCommits: [commitC, commitB, commitA],
  });

  describe("branch_exists / branch_not_exists", () => {
    it("checks whether a branch exists", async () => {
      expect((await check({ type: "branch_exists", branch: "feature/login" }, repo)).passed).toBe(
        true,
      );
      expect(await check({ type: "branch_exists", branch: "bugfix" }, repo)).toEqual({
        passed: false,
        reason: "There is no branch named bugfix.",
      });
      expect((await check({ type: "branch_not_exists", branch: "bugfix" }, repo)).passed).toBe(
        true,
      );
      expect(await check({ type: "branch_not_exists", branch: "main" }, repo)).toEqual({
        passed: false,
        reason: "A branch named main still exists.",
      });
    });

    it("does not count an unborn branch", async () => {
      const unborn = state({ branches: [{ name: "main", oid: null, current: true }] });
      expect((await check({ type: "branch_exists", branch: "main" }, unborn)).passed).toBe(false);
    });
  });

  describe("current_branch", () => {
    it("passes when HEAD is on the branch", async () => {
      expect((await check({ type: "current_branch", branch: "main" }, repo)).passed).toBe(true);
    });

    it("explains where HEAD is instead", async () => {
      expect(await check({ type: "current_branch", branch: "feature/login" }, repo)).toEqual({
        passed: false,
        reason: "You are on main, not feature/login.",
      });
      const result = await check(
        { type: "current_branch", branch: "main" },
        EMPTY_REPOSITORY_STATE,
      );
      expect(result.reason).toMatch(/not a Git repository/);
    });
  });

  describe("branch_points_to_commit", () => {
    it("matches the tip commit's message", async () => {
      const definition = { type: "branch_points_to_commit", branch: "main" } as const;
      expect((await check({ ...definition, message: "Add homepage" }, repo)).passed).toBe(true);
      expect(await check({ ...definition, message: "Add login" }, repo)).toEqual({
        passed: false,
        reason: 'main points to "Add homepage", not "Add login".',
      });
    });

    it("compares with another branch", async () => {
      const same = state({
        ...repo,
        branches: [...repo.branches, { name: "copy", oid: B, current: false }],
      });
      expect(
        (await check({ type: "branch_points_to_commit", branch: "copy", sameAs: "main" }, same))
          .passed,
      ).toBe(true);
      expect(
        await check(
          { type: "branch_points_to_commit", branch: "feature/login", sameAs: "main" },
          same,
        ),
      ).toEqual({ passed: false, reason: "feature/login and main point to different commits." });
    });

    it("fails for a missing branch", async () => {
      const result = await check(
        { type: "branch_points_to_commit", branch: "nope", message: "x" },
        repo,
      );
      expect(result.reason).toBe("There is no branch named nope.");
    });
  });

  describe("commit_on_branch", () => {
    it("finds commits reachable from the branch", async () => {
      const onFeature = { type: "commit_on_branch", branch: "feature/login" } as const;
      expect((await check({ ...onFeature, message: "Add login" }, repo)).passed).toBe(true);
      // Ancestors count too: the branch contains its whole history.
      expect((await check({ ...onFeature, message: "Initial commit" }, repo)).passed).toBe(true);
      expect(
        (await check({ type: "commit_on_branch", branch: "main", message: "Add login" }, repo))
          .passed,
      ).toBe(false);
    });

    it("excludes commits that are also on notOn", async () => {
      expect(
        (await check({ type: "commit_on_branch", branch: "feature/login", notOn: "main" }, repo))
          .passed,
      ).toBe(true);
      expect(
        await check({ type: "commit_on_branch", branch: "main", notOn: "feature/login" }, repo),
      ).toEqual({
        passed: false,
        reason: "There is no commit on main that is not on feature/login.",
      });
      expect(
        await check(
          {
            type: "commit_on_branch",
            branch: "feature/login",
            notOn: "main",
            message: "Initial commit",
          },
          repo,
        ),
      ).toEqual({
        passed: false,
        reason:
          'There is no commit on feature/login that is not on main with the message "Initial commit".',
      });
    });
  });
});

describe("merge validators", () => {
  const A = "a".repeat(40);
  const B = "b".repeat(40);
  const C = "c".repeat(40);
  const M = "d".repeat(40);
  const commitA = { ...commit("Initial commit", A), parents: [] };
  const commitB = { ...commit("Update README", B), parents: [A] };
  const commitC = { ...commit("Add login form", C), parents: [A] };
  const commitM = { ...commit("Merge branch 'feature/login'", M), parents: [B, C] };

  // Before: main → B, feature/login → C, diverged from A.
  const before = state({
    head: B,
    branches: [
      { name: "feature/login", oid: C, current: false },
      { name: "main", oid: B, current: true },
    ],
    commits: [commitB, commitA],
    allCommits: [commitB, commitC, commitA],
  });
  // After: main → M, a merge commit of B and C.
  const after = state({
    head: M,
    branches: [
      { name: "feature/login", oid: C, current: false },
      { name: "main", oid: M, current: true },
    ],
    commits: [commitM, commitB, commitC, commitA],
    allCommits: [commitM, commitB, commitC, commitA],
  });

  it("branches_merged checks that the branch is part of the target", async () => {
    const definition = { type: "branches_merged", branch: "feature/login" } as const;
    expect(await check(definition, before)).toEqual({
      passed: false,
      reason: "feature/login has not been merged into main.",
    });
    expect((await check(definition, after)).passed).toBe(true);
    expect((await check({ ...definition, into: "main" }, after)).passed).toBe(true);
    // main is not merged into feature/login.
    expect(
      (await check({ type: "branches_merged", branch: "main", into: "feature/login" }, after))
        .passed,
    ).toBe(false);
  });

  it("merge_commit_exists looks for a commit with two parents", async () => {
    expect((await check({ type: "merge_commit_exists" }, before)).passed).toBe(false);
    expect((await check({ type: "merge_commit_exists" }, after)).passed).toBe(true);
    expect(
      (await check({ type: "merge_commit_exists", branch: "feature/login" }, after)).passed,
    ).toBe(false);
    expect(
      (await check({ type: "merge_commit_exists", message: "Merge branch 'feature/login'" }, after))
        .passed,
    ).toBe(true);
  });

  it("branch_contains_commit finds commits in a branch's history", async () => {
    const definition = {
      type: "branch_contains_commit",
      branch: "main",
      message: "Add login form",
    } as const;
    expect(await check(definition, before)).toEqual({
      passed: false,
      reason: 'main does not contain a commit "Add login form".',
    });
    expect((await check(definition, after)).passed).toBe(true);
  });

  const conflicted = state({
    ...before,
    merge: { kind: "merge", branch: "feature/login", oid: C },
    conflicts: [
      { path: "src/auth.ts", ours: "a", theirs: "b", base: "c", resolved: true },
      { path: "src/config.ts", ours: "a", theirs: "b", base: "c", resolved: false },
    ],
  });

  it("conflict_exists needs a merge in progress with the conflict", async () => {
    expect(await check({ type: "conflict_exists" }, before)).toEqual({
      passed: false,
      reason: "No merge is in progress.",
    });
    expect((await check({ type: "conflict_exists" }, conflicted)).passed).toBe(true);
    expect(
      (await check({ type: "conflict_exists", file: "./src/auth.ts" }, conflicted)).passed,
    ).toBe(true);
    expect((await check({ type: "conflict_exists", file: "README.md" }, conflicted)).passed).toBe(
      false,
    );
  });

  it("conflict_resolved and all_conflicts_resolved follow each file's resolution", async () => {
    expect(
      (await check({ type: "conflict_resolved", file: "src/auth.ts" }, conflicted)).passed,
    ).toBe(true);
    expect(await check({ type: "conflict_resolved", file: "src/config.ts" }, conflicted)).toEqual({
      passed: false,
      reason: "src/config.ts still needs to be edited and staged with git add.",
    });
    expect(await check({ type: "all_conflicts_resolved" }, conflicted)).toEqual({
      passed: false,
      reason: "Still in conflict: src/config.ts.",
    });
    const resolved = state({
      ...conflicted,
      conflicts: conflicted.conflicts.map((conflict) => ({ ...conflict, resolved: true })),
    });
    expect((await check({ type: "all_conflicts_resolved" }, resolved)).passed).toBe(true);
  });

  it("merge_completed needs the merge committed", async () => {
    expect((await check({ type: "merge_completed" }, conflicted)).reason).toMatch(/in progress/);
    expect((await check({ type: "merge_completed" }, before)).passed).toBe(false);
    expect((await check({ type: "merge_completed", branch: "feature/login" }, after)).passed).toBe(
      true,
    );
  });

  it("clean_worktree fails while a merge is in progress", async () => {
    expect(await check({ type: "clean_worktree" }, conflicted)).toEqual({
      passed: false,
      reason: "A merge is still in progress.",
    });
  });
});

describe("validateObjective", () => {
  it("contains handler failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry: ValidatorRegistry = {
      ...validatorRegistry,
      repository_initialized: () => Promise.reject(new Error("boom")),
    };
    const result = await validateObjective(
      { id: "o", description: "d", validator: { type: "repository_initialized" } },
      { repository: state() },
      registry,
    );
    expect(result).toEqual({ passed: false, reason: "This objective could not be checked." });
  });
});

describe("validateLesson", () => {
  const lesson = {
    id: "first-commit",
    objectives: [
      { id: "init", description: "", validator: { type: "repository_initialized" } },
      { id: "stage", description: "", validator: { type: "file_staged", file: "README.md" } },
      { id: "commit", description: "", validator: { type: "commit_exists" } },
    ] satisfies LessonObjective[],
  };

  it("reports per-objective progress", async () => {
    const result = await validateLesson(lesson, { repository: state() });
    expect(result).toMatchObject({
      lessonId: "first-commit",
      passedCount: 1,
      totalCount: 3,
      completed: false,
    });
    expect(result.objectives.map((objective) => objective.passed)).toEqual([true, false, false]);
  });

  it("is complete when every objective passes", async () => {
    const repository = state({
      commits: [commit("Initial commit")],
      stagedFiles: [{ path: "README.md", status: "staged", change: "modified" }],
    });
    expect((await validateLesson(lesson, { repository })).completed).toBe(true);
  });
});

describe("validatorDefinitionSchema", () => {
  it("accepts every supported validator", () => {
    const definitions: unknown[] = [
      { type: "repository_initialized" },
      { type: "file_exists", file: "README.md" },
      { type: "file_staged", file: "README.md" },
      { type: "commit_exists" },
      { type: "commit_exists", message: "Initial commit" },
      { type: "commit_count", count: 2 },
      { type: "clean_worktree" },
      { type: "branch_exists", branch: "feature/login" },
      { type: "branch_not_exists", branch: "old" },
      { type: "current_branch", branch: "main" },
      { type: "branch_points_to_commit", branch: "main", message: "Initial commit" },
      { type: "branch_points_to_commit", branch: "feature", sameAs: "main" },
      { type: "commit_on_branch", branch: "feature" },
      { type: "commit_on_branch", branch: "feature", message: "Add login", notOn: "main" },
      { type: "branches_merged", branch: "feature" },
      { type: "branches_merged", branch: "feature", into: "main" },
      { type: "merge_commit_exists" },
      { type: "merge_commit_exists", branch: "main", message: "Merge" },
      { type: "branch_contains_commit", branch: "main", message: "Add login" },
      { type: "conflict_exists" },
      { type: "conflict_exists", file: "src/auth.ts" },
      { type: "conflict_resolved", file: "src/auth.ts" },
      { type: "all_conflicts_resolved" },
      { type: "merge_completed" },
      { type: "merge_completed", branch: "feature" },
    ];
    for (const definition of definitions) {
      expect(validatorDefinitionSchema.safeParse(definition).success).toBe(true);
    }
  });

  it.each([
    { type: "unknown_validator" },
    { type: "file_staged" },
    { type: "file_staged", file: "" },
    { type: "commit_count", count: -1 },
    { type: "commit_count", count: 1.5 },
    { type: "repository_initialized", extra: true },
    { type: "branch_exists" },
    { type: "current_branch", branch: " " },
    { type: "branch_points_to_commit", branch: "main" },
    { type: "branch_points_to_commit", branch: "main", message: "x", sameAs: "dev" },
    { type: "branch_contains_commit", branch: "main" },
    { type: "conflict_resolved" },
    { type: "branches_merged" },
  ])("rejects %j", (definition) => {
    expect(validatorDefinitionSchema.safeParse(definition).success).toBe(false);
  });
});

describe("recovery validators", () => {
  // main: A ← B ← R (reverts B);  feature: A ← F1 ← F2 (rebased onto A, linear)
  const A = commit("Initial commit", "a".repeat(40));
  const B = { ...commit("Add dark mode", "b".repeat(40)), parents: [A.oid] };
  const R = {
    ...commit(`Revert "Add dark mode"\n\nThis reverts commit ${B.oid}.`, "c".repeat(40)),
    parents: [B.oid],
  };
  const F1 = { ...commit("Add search", "d".repeat(40)), parents: [B.oid] };
  const F2 = { ...commit("Style search", "e".repeat(40)), parents: [F1.oid] };
  const M = { ...commit("Merge main", "f".repeat(40)), parents: [F2.oid, R.oid] };
  const repo = state({
    head: R.oid,
    branches: [
      { name: "main", oid: R.oid, current: true },
      { name: "feature", oid: F2.oid, current: false },
      { name: "merged", oid: M.oid, current: false },
    ],
    commits: [R, B, A],
    allCommits: [M, F2, F1, R, B, A],
    files: [
      { path: "app.js", status: "modified" },
      { path: "README.md", status: "committed" },
    ],
    stashes: [
      {
        selector: "stash@{0}",
        message: "WIP on main",
        branch: "main",
        oid: "9".repeat(40),
        files: ["app.js"],
      },
    ],
  });

  it("file_status compares the exact working-tree status", async () => {
    expect(
      (await check({ type: "file_status", file: "app.js", status: "modified" }, repo)).passed,
    ).toBe(true);
    expect(
      await check({ type: "file_status", file: "README.md", status: "modified" }, repo),
    ).toEqual({
      passed: false,
      reason:
        "README.md should be modified and not staged, but it is unchanged since the last commit.",
    });
    expect(
      (await check({ type: "file_status", file: "gone.txt", status: "committed" }, repo)).reason,
    ).toContain("not in the working tree");
  });

  it("commit_not_on_branch passes once a commit is gone from a branch", async () => {
    expect(
      (await check({ type: "commit_not_on_branch", branch: "main", message: "Add search" }, repo))
        .passed,
    ).toBe(true);
    expect(
      await check({ type: "commit_not_on_branch", branch: "main", message: "Add dark mode" }, repo),
    ).toEqual({
      passed: false,
      reason: 'main still contains "Add dark mode".',
    });
    expect(
      (await check({ type: "commit_not_on_branch", branch: "nope", message: "x" }, repo)).passed,
    ).toBe(false);
  });

  it("commit_reverted finds git revert's commit message", async () => {
    expect((await check({ type: "commit_reverted", message: "Add dark mode" }, repo)).passed).toBe(
      true,
    );
    expect(
      (await check({ type: "commit_reverted", message: "Add dark mode", branch: "feature" }, repo))
        .reason,
    ).toBe('There is no commit on feature reverting "Add dark mode".');
  });

  it("branch_rebased needs the new base and a straight line on top of it", async () => {
    const rebased = state({
      ...repo,
      branches: [
        { name: "main", oid: B.oid, current: true },
        { name: "feature", oid: F2.oid, current: false },
        { name: "merged", oid: M.oid, current: false },
      ],
    });
    expect(
      (await check({ type: "branch_rebased", branch: "feature", onto: "main" }, rebased)).passed,
    ).toBe(true);
    // main (R) is not in feature's history yet.
    expect(
      (await check({ type: "branch_rebased", branch: "feature", onto: "main" }, repo)).reason,
    ).toBe("feature is not based on main yet.");
    // Merging main in is not rebasing.
    expect(
      (await check({ type: "branch_rebased", branch: "merged", onto: "main" }, repo)).reason,
    ).toContain("merge commit");
  });

  it("head_detached and stash_count", async () => {
    expect((await check({ type: "head_detached" }, repo)).passed).toBe(false);
    expect(
      (await check({ type: "head_detached" }, state({ ...repo, currentBranch: null }))).passed,
    ).toBe(true);
    expect((await check({ type: "stash_count", count: 1 }, repo)).passed).toBe(true);
    expect((await check({ type: "stash_count", count: 0 }, repo)).reason).toBe(
      "Expected 0 stash entries, found 1.",
    );
  });

  it.each([
    { type: "file_status", file: "a", status: "weird" },
    { type: "commit_not_on_branch", branch: "main" },
    { type: "commit_reverted" },
    { type: "branch_rebased", branch: "x" },
    { type: "stash_count", count: -1 },
  ])("rejects %j", (definition) => {
    expect(validatorDefinitionSchema.safeParse(definition).success).toBe(false);
  });
});
