import { describe, expect, it } from "vitest";
import { isValidBranchName } from "../commands/branch";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";

const README = "# GitDojo\n";

/** A repository with one commit on main containing README.md. */
async function withInitialCommit(extraFiles: Record<string, string> = {}): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace({ "README.md": README, ...extraFiles });
  await workspace.git.init();
  await workspace.git.add(["README.md"]);
  await workspace.git.commit({ message: "Initial commit" });
  return workspace;
}

describe("isValidBranchName", () => {
  it.each(["main", "feature/login", "fix-123", "release/v1.2", "a_b"])("accepts %s", (name) => {
    expect(isValidBranchName(name)).toBe(true);
  });

  it.each([
    "",
    "HEAD",
    "-x",
    "has space",
    "a..b",
    "a~1",
    "a^",
    "a:b",
    "a?",
    "a*",
    "a[b",
    "a\\b",
    "/a",
    "a/",
    "a//b",
    "a.",
    ".hidden",
    "feature/.x",
    "x.lock",
    "a@{b",
    "@",
  ])("rejects %j", (name) => {
    expect(isValidBranchName(name)).toBe(false);
  });
});

describe("branches", () => {
  describe("showBranches / listBranches", () => {
    it("fails outside a repository and lists nothing", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      expect((await git.showBranches()).error?.code).toBe("NOT_A_REPOSITORY");
      expect(await git.listBranches()).toEqual([]);
    });

    it("prints nothing for an unborn branch but still reports it as data", async () => {
      const { git } = await createTestWorkspace();
      await git.init();
      const result = await git.showBranches();
      expect(result).toMatchObject({ ok: true, output: "" });
      expect(await git.listBranches()).toEqual([{ name: "main", oid: null, current: true }]);
    });

    it("marks the current branch and sorts by name", async () => {
      const { git } = await withInitialCommit();
      await git.createBranch("feature/login");
      await git.createBranch("bugfix");
      expect((await git.showBranches()).output).toBe("  bugfix\n  feature/login\n* main");
      const branches = await git.listBranches();
      const head = (await git.snapshot()).head;
      expect(branches).toEqual([
        { name: "bugfix", oid: head, current: false },
        { name: "feature/login", oid: head, current: false },
        { name: "main", oid: head, current: true },
      ]);
    });
  });

  describe("createBranch", () => {
    it("creates a branch at HEAD without switching", async () => {
      const { git } = await withInitialCommit();
      const head = (await git.snapshot()).head;
      const result = await git.createBranch("feature/login");
      expect(result).toEqual({ ok: true, output: "", data: { name: "feature/login", oid: head } });
      expect((await git.snapshot()).currentBranch).toBe("main");
    });

    it("refuses before the first commit", async () => {
      const { git } = await createTestWorkspace();
      await git.init();
      const result = await git.createBranch("feature");
      expect(result.error?.code).toBe("NO_COMMITS");
      expect(result.output).toBe("fatal: not a valid object name: 'main'");
    });

    it("refuses duplicates, invalid names and path clashes", async () => {
      const { git } = await withInitialCommit();
      expect((await git.createBranch("main")).output).toBe(
        "fatal: a branch named 'main' already exists",
      );
      expect(await git.createBranch("bad..name")).toMatchObject({
        ok: false,
        output: "fatal: 'bad..name' is not a valid branch name",
        error: { code: "INVALID_BRANCH_NAME" },
      });
      await git.createBranch("feature/login");
      expect((await git.createBranch("feature")).output).toBe(
        "fatal: cannot create branch 'feature': a branch named 'feature/login' already exists",
      );
    });
  });

  describe("switchBranch", () => {
    it("switches to an existing branch", async () => {
      const { git } = await withInitialCommit();
      await git.createBranch("feature/login");
      const result = await git.switchBranch("feature/login");
      expect(result).toMatchObject({ ok: true, output: "Switched to branch 'feature/login'" });
      const snapshot = await git.snapshot();
      expect(snapshot.currentBranch).toBe("feature/login");
      expect((await git.status()).output).toMatch(/^On branch feature\/login/);
    });

    it("reports when already on the branch", async () => {
      const { git } = await withInitialCommit();
      expect(await git.switchBranch("main")).toMatchObject({
        ok: true,
        output: "Already on 'main'",
        data: { switched: false },
      });
    });

    it("rejects unknown branches and a missing name", async () => {
      const { git } = await withInitialCommit();
      expect(await git.switchBranch("nope")).toMatchObject({
        ok: false,
        output: "fatal: invalid reference: nope",
        error: { code: "BRANCH_NOT_FOUND" },
      });
      expect((await git.switchBranch("")).output).toBe("fatal: missing branch or commit argument");
    });

    it("updates the working tree to match the target branch", async () => {
      const { git, files, workspaceId } = await withInitialCommit();
      await git.createAndSwitchBranch("feature/login");
      await files.writeFile(workspaceId, "src/login.js", "login();\n");
      await files.writeFile(workspaceId, "README.md", "# GitDojo\n\nNow with login.\n");
      await git.add(["."]);
      await git.commit({ message: "Add login" });

      const toMain = await git.switchBranch("main");
      expect(toMain.data?.updatedPaths).toEqual(["README.md", "src/login.js"]);
      expect(await files.exists(workspaceId, "src/login.js")).toBe(false);
      // The now-empty directory goes too, as in Git.
      expect(await files.exists(workspaceId, "src")).toBe(false);
      expect(await files.readFile(workspaceId, "README.md")).toBe(README);
      expect((await git.status()).output).toContain("nothing to commit, working tree clean");

      await git.switchBranch("feature/login");
      expect(await files.readFile(workspaceId, "src/login.js")).toBe("login();\n");
      expect(await files.readFile(workspaceId, "README.md")).toContain("Now with login.");
      expect((await git.status()).output).toContain("nothing to commit, working tree clean");
    });

    it("carries uncommitted changes that do not conflict", async () => {
      const { git, files, workspaceId } = await withInitialCommit();
      await git.createBranch("feature");
      await files.writeFile(workspaceId, "notes.txt", "draft\n");
      await files.writeFile(workspaceId, "staged.txt", "staged\n");
      await git.add(["staged.txt"]);
      await files.writeFile(workspaceId, "README.md", "# Edited\n");

      expect((await git.switchBranch("feature")).ok).toBe(true);
      const entries = (await git.status()).data?.entries ?? [];
      expect(entries).toEqual([
        expect.objectContaining({ path: "notes.txt", unstaged: "untracked" }),
        expect.objectContaining({ path: "README.md", unstaged: "modified" }),
        expect.objectContaining({ path: "staged.txt", staged: "added" }),
      ]);
    });

    it("refuses to overwrite local changes to files that differ between branches", async () => {
      const { git, files, workspaceId } = await withInitialCommit();
      await git.createAndSwitchBranch("feature");
      await files.writeFile(workspaceId, "README.md", "# Feature\n");
      await git.add(["README.md"]);
      await git.commit({ message: "Change README" });
      await git.switchBranch("main");
      await files.writeFile(workspaceId, "README.md", "# Local edit\n");

      const result = await git.switchBranch("feature");
      expect(result.error?.code).toBe("CHECKOUT_CONFLICT");
      expect(result.output).toBe(
        [
          "error: Your local changes to the following files would be overwritten by checkout:",
          "\tREADME.md",
          "Please commit your changes or stash them before you switch branches.",
          "Aborting",
        ].join("\n"),
      );
      expect((await git.snapshot()).currentBranch).toBe("main");
      expect(await files.readFile(workspaceId, "README.md")).toBe("# Local edit\n");
    });

    it("refuses to overwrite untracked files", async () => {
      const { git, files, workspaceId } = await withInitialCommit();
      await git.createAndSwitchBranch("feature");
      await files.writeFile(workspaceId, "login.js", "committed\n");
      await git.add(["login.js"]);
      await git.commit({ message: "Add login" });
      await git.switchBranch("main");
      await files.writeFile(workspaceId, "login.js", "untracked\n");

      const result = await git.switchBranch("feature");
      expect(result.error?.code).toBe("CHECKOUT_CONFLICT");
      expect(result.output).toContain("untracked working tree files would be overwritten");
      expect(await files.readFile(workspaceId, "login.js")).toBe("untracked\n");
    });
  });

  describe("createAndSwitchBranch", () => {
    it("creates the branch at HEAD and switches to it", async () => {
      const { git } = await withInitialCommit();
      const before = await git.snapshot();
      const result = await git.createAndSwitchBranch("feature/login");
      expect(result).toMatchObject({
        ok: true,
        output: "Switched to a new branch 'feature/login'",
        data: { created: true, switched: true },
      });
      const after = await git.snapshot();
      expect(after.currentBranch).toBe("feature/login");
      expect(after.head).toBe(before.head);
      expect(after.branches).toEqual([
        { name: "feature/login", oid: before.head },
        { name: "main", oid: before.head },
      ]);
    });

    it("renames the unborn branch before the first commit, like Git", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      expect((await git.createAndSwitchBranch("trunk")).ok).toBe(true);
      await git.add(["README.md"]);
      const commit = await git.commit({ message: "Initial commit" });
      expect(commit.output).toMatch(/^\[trunk \(root-commit\)/);
      expect((await git.listBranches()).map((branch) => branch.name)).toEqual(["trunk"]);
    });

    it("refuses an existing branch", async () => {
      const { git } = await withInitialCommit();
      expect((await git.createAndSwitchBranch("main")).error?.code).toBe("BRANCH_EXISTS");
    });
  });

  describe("snapshot", () => {
    it("includes commits on other branches in allCommits, children first", async () => {
      const { git, files, workspaceId } = await withInitialCommit();
      await git.createAndSwitchBranch("feature");
      await files.writeFile(workspaceId, "feature.txt", "f\n");
      await git.add(["feature.txt"]);
      await git.commit({ message: "Feature work" });
      await git.switchBranch("main");
      await files.writeFile(workspaceId, "main.txt", "m\n");
      await git.add(["main.txt"]);
      await git.commit({ message: "Main work" });

      const snapshot = await git.snapshot();
      expect(snapshot.commits.map((commit) => commit.message)).toEqual([
        "Main work",
        "Initial commit",
      ]);
      const all = snapshot.allCommits.map((commit) => commit.message);
      expect(all).toHaveLength(3);
      expect(all.at(-1)).toBe("Initial commit");
      expect(all.slice(0, 2).sort()).toEqual(["Feature work", "Main work"]);
    });

    it("orders commits made in the same second by ancestry", async () => {
      const { git, files, workspaceId } = await withInitialCommit();
      for (const name of ["a", "b", "c"]) {
        await files.writeFile(workspaceId, `${name}.txt`, name);
        await git.add([`${name}.txt`]);
        await git.commit({ message: name, timestamp: 1_700_000_000 });
      }
      const { allCommits } = await git.snapshot();
      expect(allCommits.map((commit) => commit.message)).toEqual(["c", "b", "a", "Initial commit"]);
    });
  });
});

describe("log decorations", () => {
  it("shows every branch pointing at a commit, HEAD's branch first", async () => {
    const { git } = await withInitialCommit();
    await git.createBranch("feature/login");
    expect((await git.log({ oneline: true })).output).toMatch(
      /^[0-9a-f]{7} \(HEAD -> main, feature\/login\) Initial commit$/,
    );
    await git.switchBranch("feature/login");
    expect((await git.log({ oneline: true })).output).toMatch(
      /^[0-9a-f]{7} \(HEAD -> feature\/login, main\) Initial commit$/,
    );
  });
});
