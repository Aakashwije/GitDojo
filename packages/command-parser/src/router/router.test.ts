import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { type GitEngine } from "@gitdojo/git-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CommandExecutionContext } from "./types";
import { executeCommand, runCommandLine } from "./router";

const WORKSPACE = "router-test";
let dbCounter = 0;

let files: WorkspaceFileSystem;

async function createContext(): Promise<CommandExecutionContext> {
  dbCounter += 1;
  const fs = createLightningFs(`router-test-${String(dbCounter)}`, { wipe: true });
  files = new WorkspaceFileSystem(fs);
  await files.createWorkspace(WORKSPACE);
  await files.writeFile(WORKSPACE, "README.md", "# GitDojo\n");
  return { workspaceId: WORKSPACE, git: createGitEngine({ fs, workspaceId: WORKSPACE }) };
}

describe("command router", () => {
  let context: CommandExecutionContext;

  beforeEach(async () => {
    context = await createContext();
  });

  it("runs the first-commit flow end to end", async () => {
    expect(await runCommandLine("git status", context)).toMatchObject({
      ok: false,
      errorCode: "NOT_A_REPOSITORY",
    });
    expect((await runCommandLine("git init", context)).ok).toBe(true);
    expect((await runCommandLine("git status", context)).output).toContain("\tREADME.md");
    expect(await runCommandLine("git add README.md", context)).toEqual({ ok: true, output: "" });
    const commit = await runCommandLine('git commit -m "Initial commit"', context);
    expect(commit.ok).toBe(true);
    expect(commit.output).toMatch(/^\[main \(root-commit\) [0-9a-f]{7}\] Initial commit/);
    expect((await runCommandLine("git log --oneline", context)).output).toMatch(
      /^[0-9a-f]{7} \(HEAD -> main\) Initial commit$/,
    );
  });

  it("runs the branching flow end to end", async () => {
    await runCommandLine("git init", context);
    expect((await runCommandLine("git branch feature/login", context)).output).toBe(
      "fatal: not a valid object name: 'main'",
    );
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);

    expect(await runCommandLine("git branch feature/login", context)).toEqual({
      ok: true,
      output: "",
    });
    expect((await runCommandLine("git branch", context)).output).toBe("  feature/login\n* main");
    expect(await runCommandLine("git switch feature/login", context)).toEqual({
      ok: true,
      output: "Switched to branch 'feature/login'",
    });
    expect((await runCommandLine("git switch -c bugfix", context)).output).toBe(
      "Switched to a new branch 'bugfix'",
    );
    expect((await runCommandLine("git status", context)).output).toMatch(/^On branch bugfix/);
    expect(await runCommandLine("git switch nope", context)).toEqual({
      ok: false,
      output: "fatal: invalid reference: nope",
      errorCode: "BRANCH_NOT_FOUND",
    });
    expect((await runCommandLine("git switch -c feature main", context)).errorCode).toBe(
      "INVALID_ARGUMENT",
    );
  });

  it("supports git checkout for switching branches", async () => {
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);

    expect((await runCommandLine("git checkout -b feature", context)).output).toBe(
      "Switched to a new branch 'feature'",
    );
    expect((await runCommandLine("git checkout main", context)).output).toBe(
      "Switched to branch 'main'",
    );
    expect(await runCommandLine("git checkout nope", context)).toEqual({
      ok: false,
      output: "error: pathspec 'nope' did not match any file(s) known to git",
      errorCode: "BRANCH_NOT_FOUND",
    });
    expect((await runCommandLine("git checkout", context)).errorCode).toBe("INVALID_ARGUMENT");
  });

  it("returns friendly output for unknown git commands", async () => {
    expect(await runCommandLine("git xyz", context)).toEqual({
      ok: false,
      output: "git: 'xyz' is not a git command.",
      errorCode: "UNSUPPORTED_GIT_COMMAND",
    });
  });

  it("returns friendly output for unknown commands built by hand", async () => {
    const result = await executeCommand(
      { program: "git", command: "foo", args: [], flags: {}, raw: "git foo" },
      context,
    );
    expect(result.output).toBe("git: 'foo' is not a git command.");
  });

  it("reports nothing to commit", async () => {
    await runCommandLine("git init", context);
    const result = await runCommandLine('git commit -m "Nothing"', context);
    expect(result).toMatchObject({ ok: false, errorCode: "NOTHING_TO_COMMIT" });
  });

  it("reports a missing commit message", async () => {
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    expect(await runCommandLine("git commit", context)).toEqual({
      ok: false,
      output: "error: commit message is required",
      errorCode: "INVALID_ARGUMENT",
    });
  });

  it("merges, reports conflicts and concludes with a plain git commit", async () => {
    const write = (content: string) => files.writeFile(WORKSPACE, "README.md", content);
    await runCommandLine("git init", context);
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Initial commit"', context);
    expect((await runCommandLine("git merge", context)).errorCode).toBe("INVALID_ARGUMENT");
    expect(await runCommandLine("git merge nope", context)).toEqual({
      ok: false,
      output: "merge: nope - not something we can merge",
      errorCode: "BRANCH_NOT_FOUND",
    });

    await runCommandLine("git switch -c feature", context);
    await write("# From feature\n");
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Feature"', context);
    await runCommandLine("git switch main", context);
    await write("# From main\n");
    await runCommandLine("git add README.md", context);
    await runCommandLine('git commit -m "Main"', context);

    const merge = await runCommandLine("git merge feature", context);
    expect(merge).toMatchObject({ ok: false, errorCode: "MERGE_CONFLICT" });
    expect(merge.output).toContain("CONFLICT (content): Merge conflict in README.md");
    expect((await runCommandLine("git merge --abort", context)).ok).toBe(true);

    await runCommandLine("git merge feature", context);
    await write("# From both\n");
    await runCommandLine("git add README.md", context);
    expect((await runCommandLine("git commit", context)).output).toMatch(
      /^\[main [0-9a-f]{7}\] Merge branch 'feature'$/,
    );
  });

  it("handles built-ins", async () => {
    expect(await runCommandLine("clear", context)).toEqual({
      ok: true,
      output: "",
      clearScreen: true,
    });
    const help = await runCommandLine("help", context);
    expect(help.output).toContain('git commit -m "<message>"');
  });

  it("never rejects when the engine throws unexpectedly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exploding: GitEngine = {
      ...context.git,
      workspaceId: WORKSPACE,
      status: () => Promise.reject(new Error("internal detail with stack")),
    };
    const result = await runCommandLine("git status", { workspaceId: WORKSPACE, git: exploding });
    expect(result).toEqual({
      ok: false,
      output: "fatal: something went wrong while running that command.",
      errorCode: "INTERNAL",
    });
    expect(result.output).not.toContain("internal detail");
  });
});
