import { describe, expect, it } from "vitest";
import { formatGitDate } from "../commands/log";
import { createTestWorkspace } from "../test-utils/create-test-workspace";
import { DEFAULT_AUTHOR } from "./git-engine";

const README = "# GitDojo\n";

describe("IsomorphicGitEngine", () => {
  describe("init", () => {
    it("initializes a repository on the main branch", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      const result = await git.init();
      expect(result.ok).toBe(true);
      expect(result.output).toBe("Initialized empty Git repository in ~/project/.git/");
      expect(result.data).toEqual({ reinitialized: false, defaultBranch: "main" });
      const snapshot = await git.snapshot();
      expect(snapshot.initialized).toBe(true);
      expect(snapshot.currentBranch).toBe("main");
    });

    it("reinitializes without destroying history when run twice", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      await git.commit({ message: "Initial commit" });
      const again = await git.init();
      expect(again.ok).toBe(true);
      expect(again.output).toBe("Reinitialized existing Git repository in ~/project/.git/");
      expect(again.data?.reinitialized).toBe(true);
      expect((await git.snapshot()).commits).toHaveLength(1);
    });
  });

  describe("status", () => {
    it("fails outside a repository", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      const result = await git.status();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NOT_A_REPOSITORY");
      expect(result.output).toMatch(/^fatal: not a git repository/);
    });

    it("reports untracked files in a fresh repository", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      const result = await git.status();
      expect(result.ok).toBe(true);
      expect(result.output).toBe(
        [
          "On branch main",
          "",
          "No commits yet",
          "",
          "Untracked files:",
          '  (use "git add <file>..." to include in what will be committed)',
          "\tREADME.md",
          "",
          'nothing added to commit but untracked files present (use "git add" to track)',
        ].join("\n"),
      );
    });

    it("reports staged new files", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      const result = await git.status();
      expect(result.output).toContain("Changes to be committed:");
      expect(result.output).toContain("\tnew file:   README.md");
      expect(result.data?.entries).toEqual([
        expect.objectContaining({ path: "README.md", staged: "added", unstaged: null }),
      ]);
    });

    it("reports modified files after a commit and a clean tree otherwise", async () => {
      const { git, files, workspaceId } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      await git.commit({ message: "Initial commit" });
      expect((await git.status()).output).toBe(
        "On branch main\nnothing to commit, working tree clean",
      );
      await files.writeFile(workspaceId, "README.md", "changed\n");
      const result = await git.status();
      expect(result.output).toContain("Changes not staged for commit:");
      expect(result.output).toContain("\tmodified:   README.md");
    });

    it("detects same-size rewrites made within the same second", async () => {
      const { git, files, workspaceId } = await createTestWorkspace({ "a.txt": "one" });
      await git.init();
      await git.add(["a.txt"]);
      await git.commit({ message: "First" });
      await files.writeFile(workspaceId, "a.txt", "two");
      expect((await git.status()).output).toContain("\tmodified:   a.txt");
    });

    it("reports an empty repository", async () => {
      const { git } = await createTestWorkspace();
      await git.init();
      expect((await git.status()).output).toBe(
        'On branch main\n\nNo commits yet\n\nnothing to commit (create/copy files and use "git add" to track)',
      );
    });
  });

  describe("add", () => {
    it("stages an untracked file", async () => {
      const { git } = await createTestWorkspace({ "README.md": README, "notes.txt": "n" });
      await git.init();
      const result = await git.add(["README.md"]);
      expect(result).toMatchObject({ ok: true, output: "", data: { staged: ["README.md"] } });
      const entries = (await git.snapshot()).entries;
      expect(entries.find((entry) => entry.path === "README.md")?.staged).toBe("added");
      expect(entries.find((entry) => entry.path === "notes.txt")?.unstaged).toBe("untracked");
    });

    it("stages everything with '.' including nested files and deletions", async () => {
      const { git, files, workspaceId } = await createTestWorkspace({
        "README.md": README,
        "src/index.ts": "export {};\n",
      });
      await git.init();
      expect((await git.add(["."])).data?.staged).toEqual(["README.md", "src/index.ts"]);
      await git.commit({ message: "Initial commit" });
      await files.removeFile(workspaceId, "src/index.ts");
      const result = await git.add(["."]);
      expect(result.data?.removed).toEqual(["src/index.ts"]);
      const entry = (await git.snapshot()).entries.find((e) => e.path === "src/index.ts");
      expect(entry?.staged).toBe("deleted");
    });

    it("stages a directory pathspec", async () => {
      const { git } = await createTestWorkspace({ "src/a.ts": "a", "src/b.ts": "b", "c.ts": "c" });
      await git.init();
      expect((await git.add(["src"])).data?.staged).toEqual(["src/a.ts", "src/b.ts"]);
    });

    it("fails for a missing file without staging anything", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      const result = await git.add(["README.md", "missing.md"]);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("FILE_NOT_FOUND");
      expect(result.output).toBe("fatal: pathspec 'missing.md' did not match any files");
      expect((await git.snapshot()).entries[0]?.staged).toBeNull();
    });

    it("rejects paths outside the repository", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      const result = await git.add(["../other/secret"]);
      expect(result.error?.code).toBe("INVALID_ARGUMENT");
    });

    it("requires a pathspec", async () => {
      const { git } = await createTestWorkspace();
      await git.init();
      const result = await git.add([]);
      expect(result.error?.code).toBe("INVALID_ARGUMENT");
      expect(result.output).toContain("Nothing specified, nothing added.");
    });

    it("fails outside a repository", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      expect((await git.add(["README.md"])).error?.code).toBe("NOT_A_REPOSITORY");
    });
  });

  describe("commit", () => {
    it("commits staged files with the default learner author", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      const result = await git.commit({ message: "Initial commit" });
      expect(result.ok).toBe(true);
      const shortOid = result.data?.shortOid ?? "";
      expect(shortOid).toMatch(/^[0-9a-f]{7}$/);
      expect(result.output).toBe(
        `[main (root-commit) ${shortOid}] Initial commit\n 1 file changed\n create mode 100644 README.md`,
      );
      const [commit] = (await git.snapshot()).commits;
      expect(commit).toMatchObject({
        message: "Initial commit",
        author: { name: DEFAULT_AUTHOR.name, email: DEFAULT_AUTHOR.email },
        parents: [],
      });
    });

    it("uses a custom author when given", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      await git.commit({ message: "Hi", author: { name: "Ada", email: "ada@example.com" } });
      expect((await git.snapshot()).commits[0]?.author.name).toBe("Ada");
    });

    it("fails with nothing staged", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      const result = await git.commit({ message: "Empty" });
      expect(result.ok).toBe(false);
      expect(result.error).toMatchObject({
        code: "NOTHING_TO_COMMIT",
        message: "nothing to commit",
      });
      expect(result.output).toContain("nothing added to commit but untracked files present");
    });

    it("fails with a clean tree after committing", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      await git.commit({ message: "Initial commit" });
      const result = await git.commit({ message: "Again" });
      expect(result.error?.code).toBe("NOTHING_TO_COMMIT");
      expect(result.output).toContain("nothing to commit, working tree clean");
    });

    it("requires a message", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      const result = await git.commit({ message: "   " });
      expect(result.error?.code).toBe("INVALID_ARGUMENT");
      expect(result.output).toBe("error: commit message is required");
    });

    it("fails outside a repository", async () => {
      const { git } = await createTestWorkspace();
      expect((await git.commit({ message: "x" })).error?.code).toBe("NOT_A_REPOSITORY");
    });
  });

  describe("log", () => {
    it("fails before the first commit", async () => {
      const { git } = await createTestWorkspace();
      await git.init();
      const result = await git.log();
      expect(result.error?.code).toBe("NO_COMMITS");
      expect(result.output).toBe("fatal: your current branch 'main' does not have any commits yet");
    });

    it("lists commits newest first with decorations", async () => {
      const { git, files, workspaceId } = await createTestWorkspace({ "README.md": README });
      await git.init();
      await git.add(["README.md"]);
      const first = await git.commit({ message: "Initial commit" });
      await files.writeFile(workspaceId, "README.md", "updated\n");
      await git.add(["README.md"]);
      const second = await git.commit({ message: "Update README" });

      const result = await git.log();
      expect(result.data?.commits.map((commit) => commit.message)).toEqual([
        "Update README",
        "Initial commit",
      ]);
      expect(result.data?.commits[0]?.parents).toEqual([first.data?.oid]);
      expect(result.output).toContain(`commit ${second.data?.oid ?? ""} (HEAD -> main)`);
      expect(result.output).toContain("Author: GitDojo Learner <learner@gitdojo.local>");
      expect(result.output).toContain("\n    Initial commit");

      const oneline = await git.log({ oneline: true });
      expect(oneline.output).toBe(
        `${second.data?.shortOid ?? ""} (HEAD -> main) Update README\n${first.data?.shortOid ?? ""} Initial commit`,
      );
    });

    it("fails outside a repository", async () => {
      const { git } = await createTestWorkspace();
      expect((await git.log()).error?.code).toBe("NOT_A_REPOSITORY");
    });
  });

  describe("snapshot", () => {
    it("describes an uninitialized directory", async () => {
      const { git } = await createTestWorkspace({ "README.md": README });
      expect(await git.snapshot()).toEqual({
        initialized: false,
        currentBranch: null,
        head: null,
        branches: [],
        commits: [],
        allCommits: [],
        merge: null,
        reflog: [],
        stashes: [],
        entries: [
          {
            path: "README.md",
            inHead: false,
            inIndex: false,
            inWorkdir: true,
            staged: null,
            unstaged: "untracked",
          },
        ],
      });
    });

    it("includes the unborn default branch", async () => {
      const { git } = await createTestWorkspace();
      await git.init();
      expect((await git.snapshot()).branches).toEqual([{ name: "main", oid: null }]);
    });
  });
});

describe("formatGitDate", () => {
  it("formats in the author's timezone", () => {
    // 2024-01-02T03:04:05Z
    expect(formatGitDate(1704164645, 0)).toBe("Tue Jan 2 03:04:05 2024 +0000");
    expect(formatGitDate(1704164645, -330)).toBe("Tue Jan 2 08:34:05 2024 +0530");
    expect(formatGitDate(1704164645, 300)).toBe("Mon Jan 1 22:04:05 2024 -0500");
  });
});
