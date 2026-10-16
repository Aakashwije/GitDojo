import { InvalidLessonError } from "@gitdojo/lesson-engine";
import { createDirectoryLessonSource } from "@gitdojo/lesson-engine/node";
import { play, type PlayStep } from "@gitdojo/lesson-engine/testing";
import { type PracticeTaskDefinition } from "@gitdojo/shared-types";
import { validateLesson } from "@gitdojo/validator";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  loadAllPracticeTasks,
  loadPracticeTask,
  parsePracticeTask,
  practiceToLessonDefinition,
  toPracticeSummary,
} from "./practice";
import { mentionsGitCommand } from "./practice-schema";

const source = createDirectoryLessonSource(
  fileURLToPath(new URL("../../../content/practice", import.meta.url)),
);

const VALID = `
id: sample
title: Sample
skill: branches
difficulty: beginner
scenario: Something happened.
mission: Make a branch called \`x\`.
concepts: [branches]
setup:
  initializeGit: true
  commits:
    - message: Initial commit
      files: { README.md: "# Hi\\n" }
checks:
  - type: branch_exists
    branch: x
`;

describe("practice task schema", () => {
  it("parses a valid task", () => {
    expect(parsePracticeTask(VALID)).toMatchObject({ id: "sample", skill: "branches" });
  });

  it("refuses hints, objectives and other unknown fields", () => {
    expect(() => parsePracticeTask(`${VALID}hints:\n  x: [y]\n`)).toThrow(InvalidLessonError);
    expect(() => parsePracticeTask(`${VALID}objectives: []\n`)).toThrow(InvalidLessonError);
  });

  it("needs at least one check", () => {
    expect(() => parsePracticeTask(VALID.replace(/checks:[\s\S]*$/, "checks: []\n"))).toThrow(
      /at least one check/,
    );
  });

  it("refuses a scenario or mission that names a command, with or without backticks", () => {
    expect(() =>
      parsePracticeTask(VALID.replace("Make a branch called `x`.", "Use `git branch x`.")),
    ).toThrow(/must not name the command/);
    expect(() =>
      parsePracticeTask(VALID.replace("Something happened.", "Run git switch to start.")),
    ).toThrow(/must not name the command/);
    expect(mentionsGitCommand("Your git repository has a commit.")).toBe(false);
    expect(mentionsGitCommand("Try git rebase.")).toBe(true);
  });

  it("validates its setup like lessons do", () => {
    expect(() =>
      parsePracticeTask(VALID.replace("initializeGit: true", "initializeGit: false")),
    ).toThrow(/initializeGit/);
  });
});

/** A reference solution per task, through the real parser and Git engine. */
const SOLUTIONS: Record<string, PlayStep[]> = {
  "commit-one-change": ["git add README.md", 'git commit -m "Fix typo in README"'],
  "start-a-branch": [
    "git switch -c feature/dark-theme",
    "git add theme.css",
    'git commit -m "Add dark theme"',
  ],
  "tag-a-release": ['git tag -a v2.0 -m "Version 2.0"', "git tag -d v2.0-rc"],
  "merge-a-feature": ["git switch main", "git merge feature/search"],
  "resolve-a-conflict": [
    "git merge feature/retries",
    { write: "config.js", content: "export const config = { timeout: 30, retries: 3 };\n" },
    "git add config.js",
    "git commit",
  ],
  "rescue-a-reset": ["git reflog", "git branch rescue HEAD@{1}"],
  "shelve-and-switch": [
    "git stash",
    "git switch main",
    { write: "footer.html", content: '<a href="/about">About</a>\n' },
    "git add footer.html",
    'git commit -m "Fix footer link"',
    "git switch feature/profile",
    "git stash pop",
  ],
  "catch-up-with-origin": ["git pull"],
  "squash-before-review": ["git reset --soft HEAD~3", 'git commit -m "Add charts"'],
  "rebase-onto-main": ["git rebase main"],
  "rejected-push": ["git push", "git pull --rebase", "git push"],
};

/** Whether every check holds after `steps`: practice is solved by the end state, all at once. */
async function solvedAfter(task: PracticeTaskDefinition, steps: PlayStep[]) {
  const lesson = practiceToLessonDefinition(task);
  const { states } = await play(lesson, steps);
  const repository = states.at(-1);
  if (!repository) throw new Error("no state");
  const start = states[0];
  if (!start) throw new Error("no start state");
  return {
    solved: (await validateLesson(lesson, { repository })).completed,
    solvedAtStart: (await validateLesson(lesson, { repository: start })).completed,
  };
}

describe("practice content", async () => {
  const tasks = await loadAllPracticeTasks(source);
  const byId = (id: string) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error(`missing task ${id}`);
    return task;
  };

  it("is a manageable mix of difficulties, all playable", () => {
    const count = (difficulty: string) => tasks.filter((t) => t.difficulty === difficulty).length;
    expect(count("beginner")).toBeGreaterThanOrEqual(3);
    expect(count("intermediate")).toBeGreaterThanOrEqual(3);
    expect(count("advanced")).toBeGreaterThanOrEqual(3);
    expect(tasks.length).toBeLessThanOrEqual(20);
    for (const task of tasks) expect(toPracticeSummary(task).missingCommands, task.id).toEqual([]);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
  });

  it("lists beginner tasks first", () => {
    expect(tasks[0]?.difficulty).toBe("beginner");
    expect(tasks.at(-1)?.difficulty).toBe("advanced");
  });

  it("refuses an unknown id", async () => {
    await expect(loadPracticeTask("no-such-task", source)).rejects.toThrow(/was not found/);
    await expect(loadPracticeTask("../challenges/first-commit", source)).rejects.toThrow();
  });

  it("has a solution for every task", () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(tasks.map((task) => task.id).sort());
  });

  it.each(Object.keys(SOLUTIONS))(
    "%s is solved by its solution, and not at the start",
    async (id) => {
      const { solved, solvedAtStart } = await solvedAfter(byId(id), SOLUTIONS[id] ?? []);
      expect(solvedAtStart).toBe(false);
      expect(solved).toBe(true);
    },
  );

  it("accepts other routes to the same end state", async () => {
    const viaRebase = await solvedAfter(byId("squash-before-review"), [
      "git rebase -i main",
      {
        editor: (todo) =>
          todo
            .split("\n")
            .map((line, index) => (index > 0 ? line.replace(/^pick /, "fixup ") : line))
            .join("\n"),
      },
    ]);
    expect(viaRebase.solved).toBe(true);
    const viaFetch = await solvedAfter(byId("catch-up-with-origin"), [
      "git fetch",
      "git merge origin/main",
    ]);
    expect(viaFetch.solved).toBe(true);
  });

  it("rejects end states that only look right", async () => {
    // Everything staged: scratch.txt ends up in the commit.
    const all = await solvedAfter(byId("commit-one-change"), [
      "git add .",
      'git commit -m "Fix typo in README"',
    ]);
    expect(all.solved).toBe(false);
    // A merge commit is not a straight line.
    const merged = await solvedAfter(byId("rejected-push"), ["git pull --no-rebase", "git push"]);
    expect(merged.solved).toBe(false);
    // Moving main back instead of rescuing onto a branch.
    const reset = await solvedAfter(byId("rescue-a-reset"), ["git reset --hard HEAD@{1}"]);
    expect(reset.solved).toBe(false);
    // A lightweight tag is a bookmark, not the annotated release tag the mission asks for.
    const lightweight = await solvedAfter(byId("tag-a-release"), [
      "git tag v2.0",
      "git tag -d v2.0-rc",
    ]);
    expect(lightweight.solved).toBe(false);
  });

  it("never gives a hint: the lesson definition has no hints, tips or adaptive hints", () => {
    for (const task of tasks) {
      const lesson = practiceToLessonDefinition(task);
      expect(lesson.type).toBe("challenge");
      expect(lesson.hints).toBeUndefined();
      expect(lesson.tips).toBeUndefined();
      expect(lesson.adaptiveHints).toBeUndefined();
    }
  });
});
