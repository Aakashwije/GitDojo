import { type LessonDefinition } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { resetLesson, setupLesson } from "./setup";
import { createTestEnvironment } from "./test-utils";

const WS = "lesson-setup";

const lesson: LessonDefinition = {
  id: "setup-test",
  slug: "setup-test",
  title: "Setup",
  difficulty: "beginner",
  concepts: [],
  setup: {
    files: { "README.md": "# Hello\n", "src/index.ts": "export {};\n" },
    directories: ["docs"],
  },
  objectives: [{ id: "a", description: "a", validator: { type: "repository_initialized" } }],
};

describe("setupLesson", () => {
  it("creates files and directories without a repository", async () => {
    const env = createTestEnvironment();
    const state = await setupLesson(lesson, WS, env);
    expect(state.initialized).toBe(false);
    expect(state.files.map((file) => file.path)).toEqual(["README.md", "src/index.ts"]);
    expect(await env.files.readFile(WS, "README.md")).toBe("# Hello\n");
    expect(await env.files.exists(WS, "docs")).toBe(true);
  });

  it("optionally initializes Git", async () => {
    const env = createTestEnvironment();
    const state = await setupLesson(
      { ...lesson, setup: { ...lesson.setup, initializeGit: true } },
      WS,
      env,
    );
    expect(state.initialized).toBe(true);
    expect(state.currentBranch).toBe("main");
    expect(state.files.every((file) => file.status === "untracked")).toBe(true);
  });
});

describe("setupLesson with history", () => {
  const withHistory: LessonDefinition = {
    ...lesson,
    setup: {
      initializeGit: true,
      commits: [
        { message: "Initial commit", files: { "README.md": "# Hello\n" } },
        { message: "Add homepage", files: { "index.html": "<h1>Hi</h1>\n" } },
      ],
      branches: ["feature/login"],
      files: { "README.md": "# Hello, edited\n", "notes.txt": "draft\n" },
    },
  };

  it("creates commits oldest first, then branches, then uncommitted files", async () => {
    const env = createTestEnvironment();
    const state = await setupLesson(withHistory, WS, env);
    expect(state.currentBranch).toBe("main");
    expect(state.commits.map((commit) => commit.message)).toEqual([
      "Add homepage",
      "Initial commit",
    ]);
    // Back-dated so history reads naturally, and strictly ordered.
    const [newest, oldest] = state.commits.map((commit) => commit.timestamp);
    expect(newest).toBeGreaterThan(oldest ?? Infinity);
    expect(newest).toBeLessThan(Date.now() / 1000);
    expect(state.branches).toEqual([
      { name: "feature/login", oid: state.head, current: false },
      { name: "main", oid: state.head, current: true },
    ]);
    expect(state.files).toEqual([
      { path: "index.html", status: "committed" },
      { path: "notes.txt", status: "untracked" },
      { path: "README.md", status: "modified" },
    ]);
  });
});

describe("setupLesson with diverged branches", () => {
  it("commits on other branches and starts on the chosen branch", async () => {
    const env = createTestEnvironment();
    const state = await setupLesson(
      {
        ...lesson,
        setup: {
          initializeGit: true,
          commits: [
            { message: "Initial commit", files: { "README.md": "# Hello\n" } },
            { message: "Add login", branch: "feature/login", files: { "login.js": "login\n" } },
            { message: "Update README", files: { "README.md": "# Hello, main\n" } },
          ],
          currentBranch: "feature/login",
        },
      },
      WS,
      env,
    );
    expect(state.currentBranch).toBe("feature/login");
    expect(state.commits.map((commit) => commit.message)).toEqual(["Add login", "Initial commit"]);
    expect(state.allCommits.map((commit) => commit.message).sort()).toEqual([
      "Add login",
      "Initial commit",
      "Update README",
    ]);
    // The working tree matches feature/login, which branched before main's README change.
    expect(await env.files.readFile(WS, "README.md")).toBe("# Hello\n");
    expect(await env.files.readFile(WS, "login.js")).toBe("login\n");
  });
});

describe("resetLesson", () => {
  it("restores the exact original state after learner changes", async () => {
    const env = createTestEnvironment();
    const initial = await setupLesson(lesson, WS, env);

    const git = env.gitFor(WS);
    await git.init();
    await env.files.writeFile(WS, "README.md", "changed");
    await env.files.writeFile(WS, "extra.txt", "extra");
    await git.add(["."]);
    await git.commit({ message: "Learner commit" });

    const reset = await resetLesson(lesson, WS, env);
    expect(reset).toEqual(initial);
    expect(await env.files.readFile(WS, "README.md")).toBe("# Hello\n");
    expect(await env.files.exists(WS, "extra.txt")).toBe(false);
    expect(await env.files.exists(WS, ".git")).toBe(false);
  });
});

describe("setup commands", () => {
  it("run after the history, through the real parser", async () => {
    const env = createTestEnvironment();
    const state = await setupLesson(
      {
        ...lesson,
        setup: {
          initializeGit: true,
          commits: [
            { message: "A", files: { "a.txt": "a\n" } },
            { message: "B", files: { "a.txt": "b\n" } },
          ],
          commands: ["git switch --detach HEAD~1"],
        },
      },
      WS,
      env,
    );
    expect(state.currentBranch).toBeNull();
    expect(state.commits.map((commit) => commit.message)).toEqual(["A"]);
    expect(await env.files.readFile(WS, "a.txt")).toBe("a\n");
  });

  it("fail the setup when a command fails", async () => {
    const env = createTestEnvironment();
    await expect(
      setupLesson(
        {
          ...lesson,
          setup: {
            initializeGit: true,
            commits: [{ message: "A", files: { "a.txt": "a\n" } }],
            commands: ["git switch nope"],
          },
        },
        WS,
        env,
      ),
    ).rejects.toThrow(/`git switch nope` failed: fatal: invalid reference: nope/);
  });

  it("delete files when a setup commit maps them to null", async () => {
    const env = createTestEnvironment();
    const state = await setupLesson(
      {
        ...lesson,
        setup: {
          initializeGit: true,
          commits: [
            { message: "A", files: { "a.txt": "a\n", "docs/b.md": "b\n" } },
            { message: "Remove docs", files: { "docs/b.md": null } },
          ],
        },
      },
      WS,
      env,
    );
    expect(state.commits.map((commit) => commit.message)).toEqual(["Remove docs", "A"]);
    expect(state.files).toEqual([{ path: "a.txt", status: "committed" }]);
  });
});
