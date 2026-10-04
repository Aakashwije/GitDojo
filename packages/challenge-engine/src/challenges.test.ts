import { InvalidLessonError, validateLessonDefinition } from "@gitdojo/lesson-engine";
import { createDirectoryLessonSource } from "@gitdojo/lesson-engine/node";
import { play, type PlayStep } from "@gitdojo/lesson-engine/testing";
import { type ChallengeDefinition } from "@gitdojo/shared-types";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHALLENGE_CATEGORIES, categoryInfo } from "./categories";
import {
  loadAllChallenges,
  loadChallenge,
  missingCommands,
  parseChallenge,
  toChallengeSummary,
  toLessonDefinition,
} from "./challenge";

const source = createDirectoryLessonSource(
  fileURLToPath(new URL("../../../content/challenges", import.meta.url)),
);

const VALID = `
id: sample
title: Sample
category: branching
difficulty: beginner
scenario: Something happened.
mission: Fix it.
concepts: [branches]
setup:
  initializeGit: true
  commits:
    - message: Initial commit
      files: { README.md: "# Hi\\n" }
objectives:
  - id: branch
    description: A feature branch exists.
    validator: { type: branch_exists, branch: feature }
hints:
  branch:
    - Branches are cheap.
`;

function issuesFor(yaml: string): string[] {
  try {
    parseChallenge(yaml, "test.yaml");
  } catch (error) {
    if (error instanceof InvalidLessonError) return error.issues;
    throw error;
  }
  throw new Error("expected the challenge to be rejected");
}

describe("challenge schema", () => {
  it("parses a valid challenge", () => {
    const challenge = parseChallenge(VALID);
    expect(challenge).toMatchObject({
      id: "sample",
      category: "branching",
      concepts: ["branches"],
    });
  });

  it("rejects unknown categories, keys and validators", () => {
    expect(issuesFor(VALID.replace("category: branching", "category: magic")).join("\n")).toMatch(
      /category/,
    );
    expect(issuesFor(`${VALID}\nobjective: oops\n`).join("\n")).toMatch(/objective/);
    expect(
      issuesFor(VALID.replace("type: branch_exists, branch: feature", "type: nope")).join("\n"),
    ).toMatch(/validator/);
  });

  it("requires success conditions, concepts and a mission", () => {
    expect(issuesFor(VALID.replace(/objectives:[\s\S]*?hints:/, "objectives: []\nhints:"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/at least one success condition/)]),
    );
    expect(issuesFor(VALID.replace("concepts: [branches]", "concepts: []")).join("\n")).toMatch(
      /at least one concept/,
    );
    expect(issuesFor(VALID.replace("mission: Fix it.\n", "")).join("\n")).toMatch(/mission/);
  });

  it("checks setup and hint keys like lessons do", () => {
    expect(
      issuesFor(VALID.replace("  branch:\n    - Branches", "  nope:\n    - Branches")).join("\n"),
    ).toContain('hints refer to unknown objective "nope"');
    expect(
      issuesFor(VALID.replace("initializeGit: true", "initializeGit: false")).join("\n"),
    ).toContain("setup commits require `initializeGit: true`");
  });
});

describe("availability", () => {
  const challenge: Pick<ChallengeDefinition, "requires"> = { requires: ["switch", "teleport"] };

  it("lists required commands GitDojo cannot run yet", () => {
    expect(missingCommands(challenge)).toEqual(["teleport"]);
    expect(missingCommands({})).toEqual([]);
    expect(missingCommands(challenge, () => true)).toEqual([]);
  });

  it("summarizes a challenge for the browser", () => {
    const summary = toChallengeSummary({ ...parseChallenge(VALID), requires: ["teleport"] }, 3);
    expect(summary).toEqual({
      id: "sample",
      title: "Sample",
      category: "branching",
      difficulty: "beginner",
      mission: "Fix it.",
      concepts: ["branches"],
      number: 3,
      missingCommands: ["teleport"],
    });
  });
});

describe("toLessonDefinition", () => {
  it("produces a valid challenge-type lesson", () => {
    const lesson = toLessonDefinition(parseChallenge(VALID));
    expect(lesson).toMatchObject({
      id: "sample",
      slug: "sample",
      type: "challenge",
      goal: "Fix it.",
      description: "Something happened.",
    });
    expect(() => validateLessonDefinition(lesson, "sample")).not.toThrow();
  });
});

describe("categories", () => {
  it("are listed in browser order with titles", () => {
    expect(CHALLENGE_CATEGORIES.map((category) => category.id)).toEqual([
      "basics",
      "branching",
      "merging",
      "conflicts",
      "recovery",
      "history",
      "advanced",
    ]);
    expect(categoryInfo("history").title).toBe("History");
  });
});

/** One straightforward solution per playable challenge. */
const SOLUTIONS: Record<string, PlayStep[]> = {
  "first-commit": [
    "git init",
    { write: ".gitignore", content: "debug.log\n" },
    "git add .",
    'git commit -m "Initial commit"',
  ],
  "merge-conflict": [
    "git switch main",
    "git merge release/2.0",
    {
      write: "src/config.js",
      content:
        'export const api = { host: "v2.api.example.com", timeout: 15000 };\nexport const retries = 2;\n',
    },
    "git add src/config.js",
    { delete: "docs/setup.md" },
    "git add docs/setup.md",
    "git commit",
  ],
  "detached-head": ["git switch -c fix/rounding", "git switch main"],
  "wrong-branch": ["git branch feature/login", "git reset --hard HEAD~2"],
  "uncommitted-changes": [
    "git stash",
    "git switch release",
    "git merge hotfix/rounding",
    "git switch main",
    "git stash pop",
  ],
  "undo-last-commit": [
    "git reset HEAD~1",
    { write: ".gitignore", content: "secrets.env\n" },
    "git add config.js .gitignore",
    'git commit -m "Add API config"',
  ],
  "lost-commit": ["git reflog", "git branch feature/payments HEAD@{2}"],
  "cherry-pick-fix": ["git log --oneline main", "git cherry-pick main~1"],
  "clean-up-history": ["git reset --soft HEAD~4", 'git commit -m "Add search"'],
  "repository-recovery": [
    "git reflog",
    "git reset --hard HEAD@{1}",
    "git branch feature/reports HEAD@{5}",
    "git stash pop",
    "git add src/theme.css",
    'git commit -m "Add dark mode"',
  ],
};

describe("challenge content", async () => {
  const challenges = await loadAllChallenges(source);
  const playable = challenges.filter((challenge) => missingCommands(challenge).length === 0);

  it("has globally unique ids that match their files", async () => {
    const ids = challenges.map((challenge) => challenge.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect((await loadChallenge(id, source)).id).toBe(id);
  });

  it("has a solution for every playable challenge", () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(playable.map((c) => c.id).sort());
  });

  it.each(playable.map((challenge) => [challenge.id, challenge] as const))(
    "%s can be solved and does not start solved",
    async (id, challenge) => {
      const { initial, progress } = await play(toLessonDefinition(challenge), SOLUTIONS[id] ?? []);
      expect(initial.completedObjectiveIds).toEqual([]);
      expect(progress.completed).toBe(true);
    },
  );

  const byId = (id: string) => {
    const challenge = challenges.find((candidate) => candidate.id === id);
    if (!challenge) throw new Error(`missing challenge ${id}`);
    return toLessonDefinition(challenge);
  };

  it("rejects wrong routes", async () => {
    // Committing the log file is not the same as ignoring it.
    const committedLog = await play(byId("first-commit"), [
      "git init",
      "git add .",
      'git commit -m "Initial commit"',
    ]);
    expect(committedLog.progress.currentObjectiveId).toBe("log-untracked");

    // Leaving the detached HEAD first loses the work (until the reflog is used).
    const leftBehind = await play(byId("detached-head"), ["git switch main"]);
    expect(leftBehind.progress.completed).toBe(false);

    // A new branch alone leaves the commits on main too.
    const notRestored = await play(byId("wrong-branch"), ["git branch feature/login"]);
    expect(notRestored.progress.currentObjectiveId).toBe("main-restored");

    // Deleting the secret in a new commit keeps it in the old one.
    const keyInHistory = await play(byId("undo-last-commit"), [
      "git rm --cached secrets.env",
      { write: ".gitignore", content: "secrets.env\n" },
      "git add .gitignore",
      'git commit -m "Stop tracking secrets"',
    ]);
    expect(keyInHistory.progress.completed).toBe(false);
    expect(keyInHistory.progress.currentObjectiveId).toBe("two-commits");

    // Merging main brings the features along.
    const merged = await play(byId("cherry-pick-fix"), ["git merge main"]);
    expect(merged.progress.currentObjectiveId).toBe("no-gifts");

    // Committing unfinished work instead of shelving it is not "exactly as it was".
    const committed = await play(byId("uncommitted-changes"), [
      "git add .",
      'git commit -m "WIP"',
      "git switch release",
      "git merge hotfix/rounding",
      "git switch main",
    ]);
    expect(committed.progress.currentObjectiveId).toBe("work-restored");
  });

  it("accepts other routes to the same result", async () => {
    // Recovering by resetting main back and forth works as well as a new branch.
    const viaSwitch = await play(byId("wrong-branch"), [
      "git switch -c feature/login",
      "git switch main",
      "git reset --hard HEAD~2",
    ]);
    expect(viaSwitch.progress.completed).toBe(true);
    // A mixed reset then re-staging squashes too.
    const mixed = await play(byId("clean-up-history"), [
      "git reset HEAD~4",
      "git add .",
      'git commit -m "Add search"',
    ]);
    expect(mixed.progress.completed).toBe(true);
  });
});
