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
    expect(await runCommandLine("git add README.md", context)).toMatchObject({
      ok: true,
      output: "",
    });
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

    expect(await runCommandLine("git branch feature/login", context)).toMatchObject({
      ok: true,
      output: "",
    });
    expect((await runCommandLine("git branch", context)).output).toBe("  feature/login\n* main");
    expect(await runCommandLine("git switch feature/login", context)).toMatchObject({
      ok: true,
      output: "Switched to branch 'feature/login'",
    });
    expect((await runCommandLine("git switch -c bugfix", context)).output).toBe(
      "Switched to a new branch 'bugfix'",
    );
    expect((await runCommandLine("git status", context)).output).toMatch(/^On branch bugfix/);
    expect(await runCommandLine("git switch nope", context)).toMatchObject({
      ok: false,
      output: "fatal: invalid reference: nope",
      errorCode: "BRANCH_NOT_FOUND",
    });
    // An existing name is refused before the start point is even looked at.
    expect((await runCommandLine("git switch -c feature main", context)).errorCode).toBe(
      "BRANCH_EXISTS",
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
    expect(await runCommandLine("git checkout nope", context)).toMatchObject({
      ok: false,
      output: "error: pathspec 'nope' did not match any file(s) known to git",
      errorCode: "BRANCH_NOT_FOUND",
    });
    expect((await runCommandLine("git checkout", context)).errorCode).toBe("INVALID_ARGUMENT");
  });

  it("returns friendly output for unknown git commands", async () => {
    expect(await runCommandLine("git xyz", context)).toMatchObject({
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
    expect(await runCommandLine("git commit", context)).toMatchObject({
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
    expect(await runCommandLine("git merge nope", context)).toMatchObject({
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

  it("reports which supported Git command each line ran, for usage counting", async () => {
    const command = async (line: string) => (await runCommandLine(line, context)).gitCommand;
    expect(await command("git init")).toBe("init");
    expect(await command("git status")).toBe("status");
    // Failed commands and bad arguments still name the command the learner tried.
    expect(await command("git commit")).toBe("commit");
    expect(await command('git branch feature <id of "x">')).toBe("branch");
    expect(await command('git commit -m "unclosed')).toBe("commit");
    // Help, clear, other programs and commands GitDojo does not run are not Git usage.
    expect(await command("help")).toBeUndefined();
    expect(await command("clear")).toBeUndefined();
    expect(await command("ls")).toBeUndefined();
    expect(await command("git")).toBeUndefined();
    expect(await command("git push")).toBeUndefined();
    expect(await command("git --help")).toBeUndefined();
    expect(await command("   ")).toBeUndefined();
  });

  it("handles built-ins", async () => {
    expect(await runCommandLine("clear", context)).toMatchObject({
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
    expect(result).toMatchObject({
      ok: false,
      output: "fatal: something went wrong while running that command.",
      errorCode: "INTERNAL",
    });
    expect(result.output).not.toContain("internal detail");
  });

  describe("recovery commands", () => {
    async function run(line: string) {
      return runCommandLine(line, context);
    }

    beforeEach(async () => {
      await run("git init");
      await run("git add README.md");
      await run('git commit -m "Initial commit"');
      await files.writeFile(WORKSPACE, "README.md", "# GitDojo\n\nLearn Git.\n");
    });

    it("diffs, restores, stages and unstages", async () => {
      expect((await run("git diff")).output).toContain("+Learn Git.");
      expect((await run("git diff --cached")).output).toBe("");
      await run("git add README.md");
      expect((await run("git diff --staged")).output).toContain("+Learn Git.");
      // `git reset <file>` unstages, like `git restore --staged <file>`.
      expect((await run("git reset README.md")).output).toBe(
        "Unstaged changes after reset:\nM\tREADME.md",
      );
      await run("git add README.md");
      expect(await run("git restore --staged README.md")).toMatchObject({ ok: true, output: "" });
      expect(await run("git restore README.md")).toMatchObject({ ok: true, output: "" });
      expect(await files.readFile(WORKSPACE, "README.md")).toBe("# GitDojo\n");
    });

    it("resets, then finds the lost commit in the reflog", async () => {
      await run("git add .");
      await run('git commit -m "Second"');
      expect((await run("git reset --hard HEAD~1")).output).toMatch(
        /^HEAD is now at [0-9a-f]{7} Initial commit$/,
      );
      expect((await run("git reflog")).output.split("\n")[1]).toMatch(
        /HEAD@\{1\}: commit: Second$/,
      );
      expect((await run("git reflog show main")).output).toMatch(
        /main@\{0\}: reset: moving to HEAD~1/,
      );
      expect((await run("git reset --hard HEAD@{1}")).output).toMatch(/Second$/);
      expect((await run("git reset --soft --hard")).errorCode).toBe("INVALID_ARGUMENT");
    });

    it("stashes with subcommands", async () => {
      expect((await run('git stash push -m "docs"')).output).toBe(
        "Saved working directory and index state On main: docs",
      );
      expect((await run("git stash list")).output).toBe("stash@{0}: On main: docs");
      expect((await run("git stash show")).output).toContain("README.md | 2 ++");
      expect((await run("git stash pop stash@{0}")).output).toMatch(/Dropped refs\/stash@\{0\}/);
      expect((await run("git stash frobnicate")).output).toContain("unknown subcommand");
      expect((await run("git stash drop")).output).toBe("No stash entries found.");
    });

    it("reverts and cherry-picks, with sequencer flags", async () => {
      await run("git add .");
      await run('git commit -m "Second"');
      expect((await run("git revert --no-edit HEAD")).output).toMatch(/Revert "Second"/);
      expect((await run("git revert --continue")).errorCode).toBe("NO_OPERATION");
      expect((await run("git cherry-pick --abort --skip")).errorCode).toBe("INVALID_ARGUMENT");
      expect((await run("git cherry-pick HEAD~1")).output).toMatch(/\] Second\n Date: /);
    });

    it("rebases, and refuses interactive rebases", async () => {
      expect((await run("git rebase -i main")).output).toContain(
        "does not support interactive rebase",
      );
      expect((await run("git rebase")).errorCode).toBe("INVALID_ARGUMENT");
      expect((await run("git rebase --abort")).output).toBe("fatal: No rebase in progress?");
      await run("git restore README.md");
      expect((await run("git rebase main")).output).toBe("Current branch main is up to date.");
    });

    it("removes files with git rm", async () => {
      expect((await run("git rm README.md")).errorCode).toBe("LOCAL_CHANGES");
      expect((await run("git rm -f README.md")).output).toBe("rm 'README.md'");
    });

    it("refuses a merge that cannot fast-forward with --ff-only", async () => {
      await run("git add .");
      await run('git commit -m "Second"');
      await run("git switch -c side HEAD~1");
      await files.writeFile(WORKSPACE, "side.txt", "s\n");
      await run("git add side.txt");
      await run('git commit -m "Side"');
      expect(await run("git merge --ff-only main")).toMatchObject({
        ok: false,
        output: "fatal: Not possible to fast-forward, aborting.",
        errorCode: "NOT_FAST_FORWARD",
      });
    });
  });
});
