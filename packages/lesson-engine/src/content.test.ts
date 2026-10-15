import { runCommandLine } from "@gitdojo/command-parser";
import { normalizeHints } from "@gitdojo/hints";
import { lessonTypeOf, type LessonDefinition } from "@gitdojo/shared-types";
import { evaluateAdaptiveHints } from "@gitdojo/validator";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllCourses, loadCourse, toCourseOutline } from "./course";
import { loadAllLessons, loadLesson } from "./loader";
import { createDirectoryCourseSource, createDirectoryLessonSource } from "./node";
import { type LessonProgress } from "./progress";
import { loadAllScenarios } from "./scenario";
import { applySetup } from "./setup";
import { createTestEnvironment, play as playSteps, type PlayStep } from "./test-utils";

const CONTENT_DIR = fileURLToPath(new URL("../../../content", import.meta.url));
const LESSONS_DIR = join(CONTENT_DIR, "lessons");
const source = createDirectoryLessonSource(LESSONS_DIR);
const courses = createDirectoryCourseSource(join(CONTENT_DIR, "courses"));
const lessonsFor = (course: string) => createDirectoryLessonSource(join(LESSONS_DIR, course));

async function allLessons(): Promise<LessonDefinition[]> {
  const loose = await loadAllLessons(source);
  const inCourses = (await loadAllCourses(courses, lessonsFor)).flatMap(({ lessons }) => lessons);
  return [...loose, ...inCourses];
}

// Guards every lesson in content/: a malformed lesson fails CI, not a learner's session.
describe("lesson content", () => {
  it("contains only valid lessons with globally unique ids", async () => {
    const lessons = await allLessons();
    expect(lessons.length).toBeGreaterThan(0);
    // Ids name the learner's workspace, so they must be unique across every course.
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the first-commit lesson", async () => {
    const lesson = await loadLesson("first-commit", source);
    expect(lesson.objectives.map((objective) => objective.validator.type)).toEqual([
      "repository_initialized",
      "file_staged",
      "commit_exists",
    ]);
    expect(lesson.setup.files?.["README.md"]).toContain("Welcome to your first repository.");
  });

  it("refuses slugs that could escape the content directory", async () => {
    expect(await source.read("../package")).toBeNull();
  });
});

describe("courses", () => {
  it("load in order with every listed lesson", async () => {
    const loaded = await loadAllCourses(courses, lessonsFor);
    expect(loaded.map(({ course }) => course.slug)).toEqual([
      "git-basics",
      "branching",
      "merging",
      "merge-conflicts",
      "recovery",
      "everyday-git",
      "remotes",
    ]);
  });

  it("have no lesson files that the course does not list", async () => {
    for (const { course } of await loadAllCourses(courses, lessonsFor)) {
      const files = (await readdir(join(LESSONS_DIR, course.slug)))
        .filter((name) => name.endsWith(".yaml"))
        .map((name) => name.slice(0, -".yaml".length));
      expect(files.sort()).toEqual([...course.lessons].sort());
    }
  });

  it("builds the Git Basics outline", async () => {
    const outline = toCourseOutline(await loadCourse("git-basics", courses, lessonsFor));
    expect(outline.lessons.map((lesson) => [lesson.number, lesson.slug, lesson.type])).toEqual([
      [1, "what-is-git", "concept"],
      [2, "git-vs-github", "concept"],
      [3, "git-init", "interactive"],
      [4, "git-status", "interactive"],
      [5, "working-tree", "concept"],
      [6, "staging-area", "concept"],
      [7, "git-add", "interactive"],
      [8, "git-commit", "interactive"],
      [9, "git-log", "interactive"],
      [10, "first-repository-challenge", "challenge"],
    ]);
  });

  it("builds the Branching outline", async () => {
    const outline = toCourseOutline(await loadCourse("branching", courses, lessonsFor));
    expect(outline.lessons.map((lesson) => lesson.title)).toEqual([
      "What is a Branch?",
      "Understanding HEAD",
      "Create Your First Branch",
      "Switch Between Branches",
      "Commit on a Feature Branch",
      "Branching Challenge",
    ]);
  });
});

describe("hints", () => {
  it("climb from concept to answer, and challenges never give the answer", async () => {
    const lessons = (await loadAllCourses(courses, lessonsFor))
      .flatMap(({ lessons: list }) => list)
      .filter((lesson) => lessonTypeOf(lesson) !== "concept");
    for (const lesson of lessons) {
      const challenge = lessonTypeOf(lesson) === "challenge";
      const ladders = lesson.objectives.map((objective) =>
        normalizeHints(lesson.hints?.[objective.id], { challenge }),
      );
      for (const ladder of ladders) {
        const levels = ladder.map((hint) => hint.level);
        expect(levels, lesson.id).toEqual([...levels].sort());
      }
      const answers = ladders.flat().filter((hint) => hint.level === 3);
      if (challenge) expect(answers, `${lesson.id} gives away a command`).toEqual([]);
      // Nobody is ever stuck in a guided lesson: some objective ends with the exact command.
      else expect(answers.length, `${lesson.id} never shows a command`).toBeGreaterThan(0);
    }
  });
});

describe("playground scenarios", () => {
  const scenarios = createDirectoryLessonSource(join(CONTENT_DIR, "playground"));

  it("load in order", async () => {
    expect((await loadAllScenarios(scenarios)).map((scenario) => scenario.id)).toEqual([
      "empty",
      "simple",
      "two-branches",
      "merge-conflict",
      "detached-head",
      "recovery-practice",
    ]);
  });

  it("all set up cleanly into the state they describe", async () => {
    const env = createTestEnvironment();
    const states = new Map<string, Awaited<ReturnType<typeof applySetup>>>();
    for (const scenario of await loadAllScenarios(scenarios)) {
      states.set(
        scenario.id,
        await applySetup(scenario.setup, `scenario-${scenario.id}`, env, scenario.id),
      );
    }
    expect(states.get("empty")?.commits).toEqual([]);
    expect(states.get("detached-head")).toMatchObject({ currentBranch: null });
    expect(states.get("two-branches")?.branches.map((branch) => branch.name)).toEqual([
      "feature/search",
      "main",
    ]);
    // The deleted branch's and the reset commit are on no branch, but HEAD's reflog still lists
    // them, and the stash holds the uncommitted work.
    const recovery = states.get("recovery-practice");
    expect(recovery?.branches.map((branch) => branch.name)).toEqual(["main"]);
    expect(recovery?.commits.map((commit) => commit.message)).toEqual(["Initial commit"]);
    expect(recovery?.reflog.map((entry) => entry.message)).toEqual(
      expect.arrayContaining(["commit: Add reactions", "commit: Add typing indicator"]),
    );
    expect(recovery?.stashes).toHaveLength(1);

    const conflict = await runCommandLine("git merge feature/theme", {
      workspaceId: "scenario-merge-conflict",
      git: env.gitFor("scenario-merge-conflict"),
    });
    expect(conflict.errorCode).toBe("MERGE_CONFLICT");
  });
});

/** Plays a solution and checks the lesson did not start with objectives already done. */
async function play(lesson: LessonDefinition, steps: PlayStep[]): Promise<LessonProgress> {
  const { initial, progress } = await playSteps(lesson, steps);
  expect(initial.completedObjectiveIds, `${lesson.id} starts with objectives done`).toEqual([]);
  return progress;
}

/** One straightforward solution per hands-on lesson. Every such lesson must have one. */
const AUTH_RESOLVED = [
  'export const provider = "password";',
  "// Session settings",
  "export const timeout = 60;",
  "export const rememberMe = true;",
  "",
].join("\n");

const SOLUTIONS: Record<string, PlayStep[]> = {
  "git-init": ["git init"],
  "git-status": [
    "git status",
    "git add README.md",
    "git add todo.txt",
    'git commit -m "Update README and add todo list"',
  ],
  "git-add": ["git add README.md", "git add index.js", "git add ."],
  "git-commit": [
    "git add README.md",
    'git commit -m "Add README"',
    "git add index.js",
    'git commit -m "Add app entry point"',
  ],
  "git-log": ["git log", "git add CHANGELOG.md", 'git commit -m "Add changelog"'],
  "first-repository-challenge": ["git init", "git add .", 'git commit -m "Initial commit"'],
  "git-branch": ["git branch feature/login", "git branch bugfix/header", "git branch"],
  "git-switch": ["git switch feature/login", "git switch main", "git switch -c bugfix/header"],
  "commit-on-branch": [
    "git switch -c feature/login",
    "git add login.js",
    'git commit -m "Add login page"',
    "git switch main",
  ],
  "branching-challenge": [
    "git branch feature/search",
    "git switch feature/search",
    "git add search.js",
    'git commit -m "Add search"',
    "git switch main",
  ],
  "fast-forward-merge": ["git merge feature/login", "git log --oneline"],
  "three-way-merge": ["git switch main", "git merge feature/login"],
  "merge-feature-into-main": [
    "git switch -c feature/search",
    "git add search.js",
    'git commit -m "Add city search"',
    "git switch main",
    "git merge feature/search",
  ],
  "merge-challenge": ["git merge feature/profile", "git merge bugfix/typo"],
  "resolve-first-conflict": [
    "git merge feature/login",
    { write: "src/auth.ts", content: AUTH_RESOLVED },
    "git add src/auth.ts",
    "git commit",
  ],
  "multiple-file-conflict": [
    "git merge feature/checkout",
    {
      write: "src/auth.ts",
      content:
        'export const provider = "password";\n// Session settings\nexport const timeout = 15;\n',
    },
    "git add src/auth.ts",
    {
      write: "src/config.ts",
      content: 'export const config = {\n  region: "eu-west",\n  // Network\n  retries: 5,\n};\n',
    },
    "git add src/config.ts",
    "git status",
    "git commit",
  ],
  "conflict-challenge": [
    "git switch main",
    "git merge feature/tax",
    {
      write: "src/pricing.ts",
      content: [
        "export function total(subtotal: number): number {",
        "  const discount = subtotal * 0.1;",
        "  return (subtotal - discount) * 1.08;",
        "}",
        "",
      ].join("\n"),
    },
    {
      write: "src/cart.ts",
      content: 'export const currency = "USD";\n// Limits\nexport const maxItems = 50;\n',
    },
    "git add .",
    'git commit -m "Merge feature/tax"',
  ],
  "git-diff": [
    "git diff",
    "git add src/price.js",
    "git diff --staged",
    'git commit -m "Fix total for empty carts"',
  ],
  "git-restore": ["git restore --staged notes.md", "git restore index.html"],
  "git-reset": ["git reset HEAD~1", "git add src/login.js", 'git commit -m "Add login form"'],
  "git-revert": ["git log --oneline", "git revert HEAD~1"],
  "git-stash": ["git stash", "git switch main", "git switch feature/profile", "git stash pop"],
  "git-cherry-pick": ["git log --oneline feature/charts", "git cherry-pick feature/charts~1"],
  "git-reflog": ["git reflog", "git reset --hard HEAD@{1}"],
  "git-rebase": ["git rebase main"],
  gitignore: [
    { write: ".gitignore", content: "node_modules/\n*.log\n.env\n" },
    "git add .gitignore",
    'git commit -m "Ignore logs, node_modules and .env"',
  ],
  "recovery-challenge": [
    "git reflog",
    "git reset --hard HEAD@{1}",
    "git stash pop",
    "git add src/app.js",
    'git commit -m "Add export button"',
  ],
};

describe("curriculum walkthroughs", async () => {
  const handsOn = (await loadAllCourses(courses, lessonsFor))
    .flatMap(({ lessons }) => lessons)
    .filter((lesson) => lessonTypeOf(lesson) !== "concept");

  it("has a solution for every interactive lesson and challenge", () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(handsOn.map((lesson) => lesson.id).sort());
  });

  it.each(handsOn.map((lesson) => [lesson.id, lesson] as const))(
    "%s can be completed",
    async (id, lesson) => {
      const progress = await play(lesson, SOLUTIONS[id] ?? []);
      expect(progress.completed).toBe(true);
    },
  );

  const byId = (id: string) => {
    const lesson = handsOn.find((candidate) => candidate.id === id);
    if (!lesson) throw new Error(`missing lesson ${id}`);
    return lesson;
  };

  it("accepts other valid routes through a lesson", async () => {
    // Staging everything up front still satisfies "commit README on its own" objectives in order.
    const commit = await play(byId("git-commit"), ["git add .", 'git commit -m "Add README"']);
    expect(commit.completed).toBe(true);
    // `git checkout -b` is an accepted alternative to `git switch -c`.
    const checkout = await play(byId("commit-on-branch"), [
      "git checkout -b feature/login",
      "git add .",
      'git commit -m "Login"',
      "git checkout main",
    ]);
    expect(checkout.completed).toBe(true);
  });

  it("does not complete a challenge solved the wrong way", async () => {
    const twoCommits = await play(byId("first-repository-challenge"), [
      "git init",
      "git add README.md",
      'git commit -m "Add README"',
      "git add index.js",
      'git commit -m "Add index"',
    ]);
    expect(twoCommits.completed).toBe(false);
    expect(twoCommits.currentObjectiveId).toBe("one-commit");

    const committedOnMain = await play(byId("branching-challenge"), [
      "git add search.js",
      'git commit -m "Add search"',
      "git switch -c feature/search",
      "git switch main",
    ]);
    expect(committedOnMain.completed).toBe(false);
    expect(committedOnMain.currentObjectiveId).toBe("commit");

    // --no-ff makes a merge commit, so main no longer points at feature/login's commit.
    const noFastForward = await play(byId("fast-forward-merge"), [
      "git merge --no-ff feature/login",
    ]);
    expect(noFastForward.currentObjectiveId).toBe("fast-forward");

    // Merging main into the feature branch is the wrong direction.
    const wrongDirection = await play(byId("three-way-merge"), ["git merge main"]);
    expect(wrongDirection.currentObjectiveId).toBe("on-main");
  });

  it("accepts other ways to undo and recover", async () => {
    // A soft reset keeps the work staged; unstaging the log is part of the job then.
    const soft = await play(byId("git-reset"), [
      "git reset --soft HEAD~1",
      "git restore --staged debug.log",
      'git commit -m "Add login form"',
    ]);
    expect(soft.completed).toBe(true);
    // Recovering with a new branch and a merge works as well as a reset.
    const viaBranch = await play(byId("git-reflog"), [
      "git branch rescue HEAD@{1}",
      "git merge rescue",
    ]);
    expect(viaBranch.completed).toBe(true);
    // Committing the export before recovering the invoices works too.
    const otherOrder = await play(byId("recovery-challenge"), [
      "git stash pop",
      "git add src/app.js",
      'git commit -m "Add export button"',
      "git cherry-pick HEAD@{2}",
    ]);
    expect(otherOrder.completed).toBe(true);
  });

  it("rejects undoing shared history with a reset, or merging instead of rebasing", async () => {
    const reset = await play(byId("git-revert"), ["git reset --hard HEAD~2"]);
    expect(reset.currentObjectiveId).toBe("reverted");
    const merged = await play(byId("git-rebase"), ["git merge main"]);
    expect(merged.currentObjectiveId).toBe("rebased");
    const wholeBranch = await play(byId("git-cherry-pick"), ["git merge feature/charts"]);
    expect(wholeBranch.currentObjectiveId).toBe("no-charts");
  });

  it("does not accept a conflict staged with its markers", async () => {
    const progress = await play(byId("resolve-first-conflict"), [
      "git merge feature/login",
      "git add src/auth.ts",
    ]);
    expect(progress.currentObjectiveId).toBe("resolved");
  });

  it("accepts aborting and redoing a merge", async () => {
    const progress = await play(byId("resolve-first-conflict"), [
      "git merge feature/login",
      "git merge --abort",
      "git merge feature/login",
      { write: "src/auth.ts", content: AUTH_RESOLVED },
      "git add .",
      'git commit -m "Merge feature/login"',
    ]);
    expect(progress.completed).toBe(true);
  });
});

const PRICING_RESOLVED = [
  "export function total(subtotal: number): number {",
  "  const discount = subtotal * 0.1;",
  "  return (subtotal - discount) * 1.08;",
  "}",
  "",
].join("\n");
const CART_RESOLVED = 'export const currency = "USD";\n// Limits\nexport const maxItems = 50;\n';
const CHECKOUT_AUTH =
  'export const provider = "password";\n// Session settings\nexport const timeout = 15;\n';
const CHECKOUT_CONFIG =
  'export const config = {\n  region: "eu-west",\n  // Network\n  retries: 5,\n};\n';
const ignoring = (content: string): PlayStep => ({ write: ".gitignore", content });

/**
 * For every adaptive hint rule in content: steps that leave a learner in the state it describes,
 * and steps out of it. `"reset"` marks a state only the lesson's Reset button undoes; the test
 * that no rule matches at the start covers that.
 */
const STUCK: Record<string, { stuck: PlayStep[]; resolved: PlayStep[] | "reset" }> = {
  "first-commit/readme-staged-not-committed": {
    stuck: ["git init", "git add README.md"],
    resolved: ['git commit -m "Initial commit"'],
  },
  "git-status/untracked-staged-first": {
    stuck: ["git add todo.txt"],
    resolved: ["git add README.md"],
  },
  "git-status/both-staged-not-committed": {
    stuck: ["git add README.md", "git add todo.txt"],
    resolved: ['git commit -m "Update README and add todo list"'],
  },
  "git-add/index-staged-first": { stuck: ["git add index.js"], resolved: ["git add README.md"] },
  "git-add/style-staged-first": {
    stuck: ["git add README.md", "git add style.css"],
    resolved: ["git add index.js"],
  },
  "git-commit/commit-with-other-message": {
    stuck: ["git add README.md", 'git commit -m "Initial commit"'],
    // Resetting the lesson is the way out; another commit with the right message also counts.
    resolved: ["git add index.js", 'git commit -m "Add README"'],
  },
  "git-commit/rest-staged-not-committed": {
    stuck: ["git add README.md", 'git commit -m "Add README"', "git add index.js"],
    resolved: ['git commit -m "Add app entry point"'],
  },
  "git-log/changelog-staged-not-committed": {
    stuck: ["git add CHANGELOG.md"],
    resolved: ['git commit -m "Add changelog"'],
  },
  "first-repository-challenge/readme-committed-alone": {
    stuck: ["git init", "git add README.md", 'git commit -m "Add README"'],
    resolved: "reset",
  },
  "first-repository-challenge/two-commits": {
    stuck: [
      "git init",
      "git add README.md",
      'git commit -m "Add README"',
      "git add index.js",
      'git commit -m "Add index"',
    ],
    resolved: ["git reset --soft HEAD~1"],
  },
  "git-branch/bugfix-created-first": {
    stuck: ["git branch bugfix/header"],
    resolved: ["git branch feature/login"],
  },
  "git-branch/switched-to-feature": {
    stuck: ["git branch feature/login", "git switch feature/login", "git branch bugfix/header"],
    resolved: ["git switch main"],
  },
  "git-branch/switched-to-bugfix": {
    stuck: ["git branch feature/login", "git switch -c bugfix/header"],
    resolved: ["git switch main"],
  },
  "git-switch/bugfix-first": {
    stuck: ["git switch -c bugfix/header"],
    resolved: ["git switch feature/login"],
  },
  "git-switch/bugfix-created-not-switched": {
    stuck: ["git switch feature/login", "git switch main", "git branch bugfix/header"],
    resolved: ["git switch bugfix/header"],
  },
  "commit-on-branch/committed-on-main-first": {
    stuck: ["git add login.js", 'git commit -m "Add login page"'],
    resolved: ["git reset --hard HEAD~1"],
  },
  "commit-on-branch/branch-created-not-switched": {
    stuck: ["git branch feature/login"],
    resolved: ["git switch feature/login"],
  },
  "commit-on-branch/commit-shared-with-main": {
    stuck: ["git add login.js", 'git commit -m "Add login page"', "git switch -c feature/login"],
    resolved: ["git reset --hard HEAD~1"],
  },
  "commit-on-branch/login-staged-not-committed": {
    stuck: ["git switch -c feature/login", "git add login.js"],
    resolved: ['git commit -m "Add login page"'],
  },
  "branching-challenge/committed-on-main-first": {
    stuck: ["git add search.js", 'git commit -m "Add search"'],
    resolved: ["git reset --hard HEAD~1"],
  },
  "branching-challenge/commit-shared-with-main": {
    stuck: ["git add search.js", 'git commit -m "Add search"', "git branch feature/search"],
    resolved: ["git reset --hard HEAD~1"],
  },
  "branching-challenge/committed-on-main-after-branching": {
    stuck: ["git branch feature/search", "git add search.js", 'git commit -m "Add search"'],
    resolved: ["git reset --hard HEAD~1"],
  },
  "branching-challenge/still-on-feature": {
    stuck: ["git switch -c feature/search", "git add search.js", 'git commit -m "Add search"'],
    resolved: ["git switch main"],
  },
  "gitignore/secrets-staged-early": { stuck: ["git add ."], resolved: ["git restore --staged ."] },
  "gitignore/secrets-staged": {
    stuck: [ignoring("debug.log\n"), "git add ."],
    resolved: ["git restore --staged ."],
  },
  "gitignore/ignore-staged-not-committed": {
    stuck: [ignoring("*.log\nnode_modules/\n.env\n"), "git add .gitignore"],
    resolved: ['git commit -m "Ignore logs, node_modules and .env"'],
  },
  "gitignore/secrets-committed": {
    stuck: [ignoring("*.log\nnode_modules/\n"), "git add .", 'git commit -m "Ignore"'],
    resolved: ["git rm --cached .env"],
  },
  "gitignore/rules-changed-not-committed": {
    stuck: [
      ignoring("*.log\n"),
      "git add .gitignore",
      'git commit -m "Ignore logs"',
      ignoring("*.log\nnode_modules/\n.env\n"),
    ],
    resolved: ["git add .gitignore", 'git commit -m "Ignore more files"'],
  },
  "gitignore/env-still-reported": {
    stuck: [ignoring("*.log\nnode_modules/\n"), "git add .gitignore", 'git commit -m "Ignore"'],
    resolved: [ignoring("*.log\nnode_modules/\n.env\n")],
  },
  "gitignore/log-still-reported": {
    stuck: [ignoring(".env\nnode_modules/\n"), "git add .gitignore", 'git commit -m "Ignore"'],
    resolved: [ignoring(".env\nnode_modules/\n*.log\n")],
  },
  "gitignore/node-modules-still-reported": {
    stuck: [ignoring(".env\n*.log\n"), "git add .gitignore", 'git commit -m "Ignore"'],
    resolved: [ignoring(".env\n*.log\nnode_modules/\n")],
  },
  "fast-forward-merge/on-feature-branch": {
    stuck: ["git switch feature/login"],
    resolved: ["git switch main"],
  },
  "fast-forward-merge/merge-commit-made": {
    stuck: ["git merge --no-ff feature/login"],
    resolved: ["git reset --hard HEAD~1"],
  },
  "three-way-merge/merged-the-wrong-way": {
    stuck: ["git merge main"],
    resolved: ["git switch main"],
  },
  "merge-feature-into-main/branch-created-not-switched": {
    stuck: ["git branch feature/search"],
    resolved: ["git switch feature/search"],
  },
  "merge-feature-into-main/commit-shared-with-main": {
    stuck: ["git add search.js", 'git commit -m "Add city search"', "git switch -c feature/search"],
    resolved: ["git reset --hard HEAD~1"],
  },
  "merge-challenge/on-profile-branch": {
    stuck: ["git switch feature/profile"],
    resolved: ["git switch main"],
  },
  "merge-challenge/on-typo-branch": {
    stuck: ["git merge feature/profile", "git switch bugfix/typo"],
    resolved: ["git switch main"],
  },
  "resolve-first-conflict/edited-not-staged": {
    stuck: ["git merge feature/login", { write: "src/auth.ts", content: AUTH_RESOLVED }],
    resolved: ["git add src/auth.ts"],
  },
  "resolve-first-conflict/merge-stopped-before-resolving": {
    stuck: ["git merge feature/login", "git merge --abort"],
    resolved: ["git merge feature/login"],
  },
  "resolve-first-conflict/merge-stopped-before-committing": {
    stuck: [
      "git merge feature/login",
      { write: "src/auth.ts", content: AUTH_RESOLVED },
      "git add src/auth.ts",
      "git merge --abort",
    ],
    resolved: ["git merge feature/login"],
  },
  "multiple-file-conflict/auth-edited-not-staged": {
    stuck: ["git merge feature/checkout", { write: "src/auth.ts", content: CHECKOUT_AUTH }],
    resolved: ["git add src/auth.ts"],
  },
  "multiple-file-conflict/merge-stopped": {
    stuck: ["git merge feature/checkout", "git merge --abort"],
    resolved: ["git merge feature/checkout"],
  },
  "multiple-file-conflict/config-edited-not-staged": {
    stuck: [
      "git merge feature/checkout",
      { write: "src/auth.ts", content: CHECKOUT_AUTH },
      "git add src/auth.ts",
      { write: "src/config.ts", content: CHECKOUT_CONFIG },
    ],
    resolved: ["git add src/config.ts"],
  },
  "multiple-file-conflict/config-still-conflicted": {
    stuck: [
      "git merge feature/checkout",
      { write: "src/auth.ts", content: CHECKOUT_AUTH },
      "git add src/auth.ts",
    ],
    resolved: [{ write: "src/config.ts", content: CHECKOUT_CONFIG }, "git add src/config.ts"],
  },
  "multiple-file-conflict/all-resolved-not-committed": {
    stuck: [
      "git merge feature/checkout",
      { write: "src/auth.ts", content: CHECKOUT_AUTH },
      { write: "src/config.ts", content: CHECKOUT_CONFIG },
      "git add .",
    ],
    resolved: ["git commit"],
  },
  "conflict-challenge/merging-the-wrong-way": {
    stuck: ["git merge main"],
    resolved: ["git merge --abort"],
  },
  "conflict-challenge/pricing-edited-not-staged": {
    stuck: [
      "git switch main",
      "git merge feature/tax",
      { write: "src/pricing.ts", content: PRICING_RESOLVED },
    ],
    resolved: ["git add src/pricing.ts"],
  },
  "conflict-challenge/cart-edited-not-staged": {
    stuck: [
      "git switch main",
      "git merge feature/tax",
      { write: "src/cart.ts", content: CART_RESOLVED },
    ],
    resolved: ["git add src/cart.ts"],
  },
  "conflict-challenge/resolved-not-committed": {
    stuck: [
      "git switch main",
      "git merge feature/tax",
      { write: "src/pricing.ts", content: PRICING_RESOLVED },
      { write: "src/cart.ts", content: CART_RESOLVED },
      "git add .",
    ],
    resolved: ['git commit -m "Merge feature/tax"'],
  },
  "git-diff/debug-staged-too": {
    stuck: ["git add ."],
    resolved: ["git restore --staged src/config.js"],
  },
  "git-diff/debug-committed": {
    stuck: ["git add .", 'git commit -m "Fix total for empty carts"'],
    resolved: ["git reset HEAD~1"],
  },
  "git-restore/notes-deleted-while-staged": {
    stuck: [{ delete: "notes.md" }],
    resolved: ["git restore notes.md"],
  },
  "git-restore/notes-committed": {
    stuck: ['git commit -m "Add notes"'],
    resolved: ["git reset HEAD~1"],
  },
  "git-restore/notes-lost": {
    // Deleted while still staged, then unstaged: the staging area held the last copy.
    stuck: [{ delete: "notes.md" }, "git restore --staged notes.md"],
    resolved: "reset",
  },
  "git-restore/experiment-staged": {
    stuck: ["git add .", "git restore --staged notes.md"],
    resolved: ["git restore --staged index.html", "git restore index.html"],
  },
  "git-reset/hard-reset-lost-files": {
    stuck: ["git reset --hard HEAD~1"],
    resolved: ["git reset --hard HEAD@{1}"],
  },
  "git-reset/log-staged": {
    stuck: ["git reset HEAD~1", "git add ."],
    resolved: ["git restore --staged debug.log"],
  },
  "git-reset/log-committed": {
    stuck: ["git reset HEAD~1", "git add .", 'git commit -m "Add login form"'],
    resolved: ["git reset HEAD~1"],
  },
  "git-revert/footer-reverted": {
    stuck: ["git revert HEAD"],
    resolved: ["git reset --hard HEAD~1"],
  },
  "git-revert/history-reset": {
    stuck: ["git reset --hard HEAD~2"],
    resolved: ["git reset --hard HEAD@{1}"],
  },
  "git-stash/work-committed": {
    stuck: ["git add profile.js", 'git commit -m "WIP"'],
    resolved: ["git reset HEAD~1"],
  },
  "git-stash/work-discarded": { stuck: ["git restore profile.js"], resolved: "reset" },
  "git-stash/applied-not-dropped": {
    stuck: ["git stash", "git switch main", "git switch feature/profile", "git stash apply"],
    resolved: ["git stash drop"],
  },
  "git-cherry-pick/whole-branch-merged": {
    stuck: ["git merge feature/charts"],
    resolved: ["git reset --hard HEAD@{1}"],
  },
  "git-reflog/reset-too-far": {
    stuck: ["git reset --hard HEAD~1"],
    resolved: ["git reset --hard HEAD@{2}"],
  },
  "git-reflog/files-left-behind-staged": {
    stuck: ["git reset --soft HEAD@{1}"],
    resolved: ["git reset --hard HEAD"],
  },
  "git-reflog/files-left-behind": {
    stuck: ["git reset HEAD@{1}"],
    resolved: ["git reset --hard HEAD"],
  },
  "git-rebase/merged-instead": { stuck: ["git merge main"], resolved: ["git reset --hard HEAD~1"] },
  "git-rebase/on-main": { stuck: ["git switch main"], resolved: ["git switch feature/search"] },
  "recovery-challenge/export-popped-not-committed": {
    stuck: ["git reset --hard HEAD@{1}", "git stash pop"],
    resolved: ["git add src/app.js", 'git commit -m "Add export button"'],
  },
  "recovery-challenge/applied-not-dropped": {
    stuck: [
      "git reset --hard HEAD@{1}",
      "git stash apply",
      "git add src/app.js",
      'git commit -m "Add export button"',
    ],
    resolved: ["git stash drop"],
  },
};

/** Hands-on lessons with no state worth a rule: before `git init` there is only the start. */
const NO_STUCK_STATE = new Set(["git-init"]);

describe("adaptive hints", async () => {
  const lessons = await allLessons();
  const handsOn = lessons.filter((lesson) => lessonTypeOf(lesson) !== "concept");
  const rules = lessons.flatMap((lesson) =>
    (lesson.adaptiveHints ?? []).map((rule) => ({ lesson, rule, key: `${lesson.id}/${rule.id}` })),
  );

  /** The rule offered after `steps`, for whichever objective is current by then. */
  async function offeredAfter(lesson: LessonDefinition, steps: PlayStep[]) {
    const { progress, states } = await playSteps(lesson, steps);
    const repository = states.at(-1);
    if (!repository || progress.currentObjectiveId === null) return null;
    return evaluateAdaptiveHints(lesson.adaptiveHints ?? [], progress.currentObjectiveId, {
      repository,
    });
  }

  it("are authored for every hands-on lesson with a state worth one", () => {
    for (const lesson of handsOn) {
      const count = lesson.adaptiveHints?.length ?? 0;
      if (NO_STUCK_STATE.has(lesson.id)) expect(count, lesson.id).toBe(0);
      else expect(count, `${lesson.id} has no adaptive hints`).toBeGreaterThan(0);
    }
  });

  it("has a stuck state for every rule", () => {
    expect(Object.keys(STUCK).sort()).toEqual(rules.map(({ key }) => key).sort());
  });

  // One case per lesson: setting each one up takes a while, so they get a timeout each.
  const withRules = lessons.filter((lesson) => (lesson.adaptiveHints ?? []).length > 0);
  it.each(withRules.map((lesson) => [lesson.id, lesson] as const))(
    "%s offers no rule at the start",
    async (_id, lesson) => {
      expect(await offeredAfter(lesson, [])).toBeNull();
    },
  );

  it("never gives a challenge's command away", () => {
    for (const { key, lesson, rule } of rules) {
      if (lessonTypeOf(lesson) !== "challenge") continue;
      const levels = normalizeHints(rule.hints, { challenge: true }).map((hint) => hint.level);
      expect(levels, key).not.toContain(3);
    }
  });

  it.each(rules.map(({ key, lesson, rule }) => [key, lesson, rule.id] as const))(
    "%s is offered in its stuck state and gone once it is resolved",
    async (key, lesson, ruleId) => {
      const { stuck, resolved } = STUCK[key] ?? { stuck: [], resolved: "reset" };
      expect(await offeredAfter(lesson, stuck)).toBe(ruleId);
      if (resolved !== "reset") {
        expect(await offeredAfter(lesson, [...stuck, ...resolved])).not.toBe(ruleId);
      }
    },
  );
});
