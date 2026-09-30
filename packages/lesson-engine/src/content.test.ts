import { runCommandLine } from "@gitdojo/command-parser";
import { lessonTypeOf, type LessonDefinition } from "@gitdojo/shared-types";
import { validateLesson } from "@gitdojo/validator";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllCourses, loadCourse, toCourseOutline } from "./course";
import { loadAllLessons, loadLesson } from "./loader";
import { createDirectoryCourseSource, createDirectoryLessonSource } from "./node";
import { advanceProgress, createInitialProgress, type LessonProgress } from "./progress";
import { setupLesson } from "./setup";
import { createTestEnvironment } from "./test-utils";

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

/**
 * Plays commands through the real parser, Git engine and validators, exactly like a learner's
 * session, and returns the progress after each step.
 */
/** A command typed in the terminal, or a file edited in the UI (e.g. resolving a conflict). */
type Step = string | { write: string; content: string };

async function play(lesson: LessonDefinition, steps: Step[]): Promise<LessonProgress> {
  const env = createTestEnvironment();
  const workspaceId = `curriculum-${lesson.id}`;
  let repository = await setupLesson(lesson, workspaceId, env);
  let progress = advanceProgress(
    lesson,
    createInitialProgress(lesson),
    await validateLesson(lesson, { repository }),
  );
  expect(progress.completedObjectiveIds, `${lesson.id} starts with objectives done`).toEqual([]);

  for (const step of steps) {
    if (typeof step !== "string") {
      await env.files.writeFile(workspaceId, step.write, step.content);
    } else {
      const result = await runCommandLine(step, { workspaceId, git: env.gitFor(workspaceId) });
      // `git merge` reports a conflict as a failure; that is the expected outcome in these lessons.
      const expectedFailure = result.errorCode === "MERGE_CONFLICT";
      expect(
        result.ok || expectedFailure,
        `${lesson.id}: \`${step}\` failed:\n${result.output}`,
      ).toBe(true);
    }
    repository = await env.stateReader.read(workspaceId);
    progress = advanceProgress(lesson, progress, await validateLesson(lesson, { repository }));
  }
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

const SOLUTIONS: Record<string, Step[]> = {
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
