import { InvalidLessonError, validateLessonDefinition } from "@gitdojo/lesson-engine";
import { createDirectoryLessonSource } from "@gitdojo/lesson-engine/node";
import { play, type PlayStep } from "@gitdojo/lesson-engine/testing";
import { type ChallengeDefinition, type LessonTip } from "@gitdojo/shared-types";
import { evaluateTips } from "@gitdojo/validator";
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

describe("tips", () => {
  const withTips = (body: string) => `${VALID}tips:\n${body}`;

  it("accepts conditions written like objective validators", () => {
    const challenge = parseChallenge(
      withTips(
        "  - id: on-main\n    when:\n      - type: current_branch\n        branch: main\n    text: The work is on `main`.\n",
      ),
    );
    expect(challenge.tips).toEqual([
      {
        id: "on-main",
        when: [{ type: "current_branch", branch: "main" }],
        text: "The work is on `main`.",
      },
    ]);
  });

  it("is optional, so a challenge without tips loads unchanged", () => {
    expect(parseChallenge(VALID).tips).toBeUndefined();
    expect(toLessonDefinition(parseChallenge(VALID)).tips).toBeUndefined();
  });

  it("rejects a tip with no condition, a duplicate id, or the command spelled out", () => {
    expect(
      issuesFor(withTips("  - id: empty\n    when: []\n    text: Nope.\n")).join("\n"),
    ).toMatch(/at least one condition/);
    const duplicate =
      "  - id: same\n    when:\n      - type: current_branch\n        branch: main\n    text: One.\n" +
      "  - id: same\n    when:\n      - type: current_branch\n        branch: main\n    text: Two.\n";
    expect(issuesFor(withTips(duplicate)).join("\n")).toContain('duplicate tip id "same"');
    // Challenges never hand over the command, in a tip any more than in a hint.
    expect(
      issuesFor(
        withTips(
          "  - id: bossy\n    when:\n      - type: current_branch\n        branch: main\n    text: Run `git switch main`.\n",
        ),
      ).join("\n"),
    ).toContain("must not name the command");
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

/** The conflict in `src/config.js` resolved the way the mission describes. */
const CONFIG_RESOLVED =
  'export const api = { host: "v2.api.example.com", timeout: 15000 };\nexport const retries = 2;\n';

/**
 * Wrong turns, each expected to surface one specific tip. The tip's conditions are the record of
 * what the app observes; these play the route that produces that state and check the learner is
 * told about it.
 */
const MISTAKES: { challenge: string; tip: string; steps: PlayStep[] }[] = [
  // Staging the folder takes the log with it, and a commit keeps it for good.
  {
    challenge: "first-commit",
    tip: "log-committed",
    steps: ["git init", "git add .", 'git commit -m "Initial commit"'],
  },
  // The site and the ignore rule recorded separately: two commits where the mission wants one.
  {
    challenge: "first-commit",
    tip: "split-commits",
    steps: [
      "git init",
      { write: ".gitignore", content: "debug.log\n" },
      "git add .gitignore",
      'git commit -m "Ignore the log"',
      "git add .",
      'git commit -m "Add the site"',
    ],
  },
  // main moved back before anything pointed at the login commits.
  {
    challenge: "wrong-branch",
    tip: "commits-unreachable",
    steps: ["git reset --hard HEAD~2"],
  },
  // A mixed reset leaves the login files loose in the working tree.
  {
    challenge: "wrong-branch",
    tip: "login-files-loose",
    steps: ["git branch feature/login", "git reset HEAD~2"],
  },
  // Leaving the detached HEAD before naming the work.
  { challenge: "detached-head", tip: "left-detached", steps: ["git switch main"] },
  // A branch created after leaving starts at main, not at the fix.
  {
    challenge: "detached-head",
    tip: "branch-missed-the-work",
    steps: ["git switch main", "git branch fix/rounding"],
  },
  // The hotfix merged into the branch the learner happened to be on.
  {
    challenge: "uncommitted-changes",
    tip: "hotfix-on-main",
    steps: ["git stash", "git merge hotfix/rounding"],
  },
  // Committing the unfinished rework instead of shelving it.
  {
    challenge: "uncommitted-changes",
    tip: "rework-missing",
    steps: [
      "git add .",
      'git commit -m "WIP"',
      "git switch release",
      "git merge hotfix/rounding",
      "git switch main",
    ],
  },
  // Applying the stash brings the work back but leaves the entry behind.
  {
    challenge: "uncommitted-changes",
    tip: "stash-left-behind",
    steps: [
      "git stash",
      "git switch release",
      "git merge hotfix/rounding",
      "git switch main",
      "git stash apply",
    ],
  },
  // Merging main into the release instead of the other way round.
  {
    challenge: "merge-conflict",
    tip: "merged-backwards",
    steps: [
      "git merge main",
      { write: "src/config.js", content: CONFIG_RESOLVED },
      "git add src/config.js",
      { delete: "docs/setup.md" },
      "git add docs/setup.md",
      "git commit",
    ],
  },
  // Deleting the secret in a new commit leaves the key in the old one.
  {
    challenge: "undo-last-commit",
    tip: "extra-commit",
    steps: [
      "git rm --cached secrets.env",
      { write: ".gitignore", content: "secrets.env\n" },
      "git add .gitignore",
      'git commit -m "Stop tracking secrets"',
    ],
  },
  // An ignore rule does nothing for a file Git already tracks.
  {
    challenge: "undo-last-commit",
    tip: "ignoring-a-tracked-file",
    steps: [{ write: ".gitignore", content: "secrets.env\n" }],
  },
  // Recovering by moving main rather than by restoring the branch.
  {
    challenge: "lost-commit",
    tip: "main-moved",
    steps: ["git reflog", "git reset --hard HEAD@{2}"],
  },
  // The branch recreated where HEAD happens to be.
  {
    challenge: "lost-commit",
    tip: "branch-at-wrong-commit",
    steps: ["git branch feature/payments"],
  },
  // Merging main brings every feature along.
  { challenge: "cherry-pick-fix", tip: "features-came-along", steps: ["git merge main"] },
  // Copying main's tip copies the wrong commit.
  { challenge: "cherry-pick-fix", tip: "wrong-commit-copied", steps: ["git cherry-pick main"] },
  // A hard reset discards the search code along with the messy commits.
  {
    challenge: "clean-up-history",
    tip: "search-code-gone",
    steps: ["git reset --hard HEAD~4"],
  },
  // A tidy commit on top of the mess is not a squash.
  {
    challenge: "clean-up-history",
    tip: "wip-still-there",
    steps: [
      {
        write: "src/search.js",
        content: "export function search(books, term) {\n  return books;\n}\n",
      },
      "git add src/search.js",
      'git commit -m "Add search"',
    ],
  },
  // Dropping the stash without applying it loses the dark-mode work entirely.
  { challenge: "repository-recovery", tip: "dark-mode-gone", steps: ["git stash drop"] },
  // The branch recreated at main's tip does not hold the reports commit.
  {
    challenge: "repository-recovery",
    tip: "reports-at-wrong-commit",
    steps: ["git branch feature/reports"],
  },
  // Applying rather than popping leaves the entry in the list.
  {
    challenge: "repository-recovery",
    tip: "stash-not-cleared",
    steps: [
      "git reflog",
      "git reset --hard HEAD@{1}",
      "git branch feature/reports HEAD@{5}",
      "git stash apply",
      "git add src/theme.css",
      'git commit -m "Add dark mode"',
    ],
  },
];

describe("mistake tips", async () => {
  const challenges = await loadAllChallenges(source);
  const lessons = new Map(challenges.map((c) => [c.id, toLessonDefinition(c)]));
  const lessonFor = (id: string) => {
    const lesson = lessons.get(id);
    if (!lesson) throw new Error(`missing challenge ${id}`);
    return lesson;
  };
  const tipsOf = (id: string): LessonTip[] => lessonFor(id).tips ?? [];

  it("are authored for every challenge, with ids that read as states", () => {
    for (const challenge of challenges) {
      expect(challenge.tips?.length, `${challenge.id} has no tips`).toBeGreaterThan(0);
    }
  });

  it("stay silent through the whole of each reference solution", async () => {
    for (const [id, steps] of Object.entries(SOLUTIONS)) {
      const { states } = await play(lessonFor(id), steps);
      for (const [index, repository] of states.entries()) {
        const matched = await evaluateTips(tipsOf(id), { repository });
        // Index 0 is the starting state: a tip there would greet every learner.
        expect(matched, `${id} shows ${matched.join(", ")} at step ${String(index)}`).toEqual([]);
      }
    }
  }, 300_000);

  it.each(MISTAKES.map((mistake) => [`${mistake.challenge}: ${mistake.tip}`, mistake] as const))(
    "%s",
    async (_name, { challenge, tip, steps }) => {
      const lesson = lessonFor(challenge);
      const { states, progress } = await play(lesson, steps);
      const repository = states.at(-1);
      if (!repository) throw new Error("no state to check");
      const matched = await evaluateTips(tipsOf(challenge), { repository });
      // The first match is the one shown, so the expected tip has to win, not merely match.
      expect(matched[0]).toBe(tip);
      // A tip marks a wrong turn: it must never coincide with a solved challenge.
      expect(progress.completed).toBe(false);
    },
    120_000,
  );

  it("disappears once the state it describes is gone", async () => {
    const lesson = lessonFor("cherry-pick-fix");
    const { states } = await play(lesson, ["git merge main", "git reset --hard HEAD~1"]);
    const [, afterMerge, afterReset] = states;
    expect(
      afterMerge && (await evaluateTips(tipsOf("cherry-pick-fix"), { repository: afterMerge })),
    ).toEqual(["features-came-along"]);
    expect(
      afterReset && (await evaluateTips(tipsOf("cherry-pick-fix"), { repository: afterReset })),
    ).toEqual([]);
  }, 120_000);
});
