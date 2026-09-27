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
