import { runCommandLine } from "@gitdojo/command-parser";
import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type GitEducationalError } from "@gitdojo/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import { EDUCATIONAL_CODES, explainCommand } from "./explain";
import { closestMatches, editDistance } from "./suggest";

const WS = "errors";
let counter = 0;
let files: WorkspaceFileSystem;
let run: (command: string) => Promise<GitEducationalError | null>;

beforeEach(async () => {
  counter += 1;
  const fs = createLightningFs(`errors-${String(counter)}`, { wipe: true });
  files = new WorkspaceFileSystem(fs);
  await files.createWorkspace(WS);
  await files.writeFile(WS, "README.md", "# Shop\n");
  const gitFor = (id: string) => createGitEngine({ fs, workspaceId: id });
  const reader = createRepositoryStateReader(gitFor);
  run = async (command) => {
    const result = await runCommandLine(command, { workspaceId: WS, git: gitFor(WS) });
    return explainCommand({ command, ...result, repository: await reader.read(WS) });
  };
});

async function firstCommit() {
  await run("git init");
  await run("git add README.md");
  await run('git commit -m "Initial commit"');
}

describe("explainCommand", () => {
  it("says nothing about ordinary successful commands", async () => {
    expect(await run("git init")).toBeNull();
    expect(await run("git status")).toBeNull();
  });

  it("explains a missing repository, keeping Git's own message", async () => {
    const explanation = await run("git status");
    expect(explanation).toMatchObject({
      code: "NOT_A_REPOSITORY",
      severity: "error",
      terminalMessage: "fatal: not a git repository (or any of the parent directories): .git",
      learnMore: { course: "git-basics", lesson: "git-init" },
    });
    expect(explanation?.hints).toContain("Run `git init` to turn this folder into a repository.");
  });

  it("names the learner's own unstaged and untracked files when nothing is staged", async () => {
    await firstCommit();
    await files.writeFile(WS, "README.md", "# Shop v2\n");
    await files.writeFile(WS, "cart.js", "x\n");
    const explanation = await run('git commit -m "x"');
    expect(explanation?.code).toBe("NOTHING_TO_COMMIT");
    expect(explanation?.possibleCauses).toEqual([
      "You changed `README.md` but did not stage it.",
      "`cart.js` is untracked: Git is not including it yet.",
    ]);
  });

  it("suggests the branch the learner probably meant", async () => {
    await firstCommit();
    await run("git branch feature/login");
    const explanation = await run("git switch feature/logn");
    expect(explanation?.code).toBe("UNKNOWN_BRANCH");
    expect(explanation?.possibleCauses?.[0]).toBe("Did you mean `feature/login`?");
    expect(explanation?.possibleCauses?.[1]).toBe(
      "This repository's branches are `feature/login`, `main`.",
    );
  });

  it("explains switching to a commit instead of a branch", async () => {
    await firstCommit();
    const explanation = await run("git switch HEAD");
    expect(explanation?.title).toBe("That is a commit, not a branch");
    expect(explanation?.hints?.[0]).toBe(
      "To look around at that commit, run `git switch --detach HEAD`.",
    );
  });

  it("explains uncommitted changes in the way, listing the files", async () => {
    await firstCommit();
    await run("git switch -c other");
    await files.writeFile(WS, "README.md", "# Other\n");
    await run("git add .");
    await run('git commit -m "Other"');
    await run("git switch main");
    await files.writeFile(WS, "README.md", "# Local\n");
    const explanation = await run("git switch other");
    expect(explanation).toMatchObject({ code: "UNSTAGED_CHANGES" });
    expect(explanation?.explanation).toContain("switching branches would overwrite work");
    expect(explanation?.possibleCauses).toEqual(["`README.md` has changes that would be lost."]);
  });

  it("explains a conflict for the operation that stopped", async () => {
    await firstCommit();
    await run("git switch -c other");
    await files.writeFile(WS, "README.md", "# Theirs\n");
    await run("git add .");
    await run('git commit -m "Theirs"');
    await run("git switch main");
    await files.writeFile(WS, "README.md", "# Ours\n");
    await run("git add .");
    await run('git commit -m "Ours"');
    const merge = await run("git merge other");
    expect(merge?.code).toBe("MERGE_CONFLICT");
    expect(merge?.possibleCauses).toEqual(["In conflict: `README.md`."]);
    expect(merge?.hints?.[2]).toBe(
      "Then finish with `git commit` (or give up with `git merge --abort`).",
    );
    // Trying something else meanwhile explains the operation in progress.
    expect((await run("git rebase other"))?.code).toBe("OPERATION_IN_PROGRESS");
    expect((await run("git commit -m done"))?.code).toBe("UNRESOLVED_CONFLICTS");
  });

  it("notices a detached HEAD and commits left behind", async () => {
    await firstCommit();
    const detached = await run("git switch --detach HEAD");
    expect(detached).toMatchObject({ code: "DETACHED_HEAD", severity: "notice" });
    await files.writeFile(WS, "lab.txt", "x\n");
    await run("git add lab.txt");
    await run('git commit -m "Experiment"');
    const leaving = await run("git switch main");
    expect(leaving).toMatchObject({ code: "COMMITS_LEFT_BEHIND", severity: "notice" });
    expect(leaving?.hints?.[0]).toMatch(
      /^Keep them by creating a branch: `git branch <new-branch-name> [0-9a-f]{7}`\.$/,
    );
  });

  it("explains commits that do not exist, and history that is too short", async () => {
    await firstCommit();
    const tooFar = await run("git reset HEAD~3");
    expect(tooFar?.code).toBe("INVALID_COMMIT");
    expect(tooFar?.possibleCauses).toContain(
      "`HEAD~3` goes back further than the history does (1 commit).",
    );
  });

  it("covers the rest of the requested codes", async () => {
    await firstCommit();
    expect((await run("git branch main"))?.code).toBe("BRANCH_ALREADY_EXISTS");
    expect((await run("git add READM.md"))?.code).toBe("PATH_NOT_FOUND");
    expect((await run("git add READM.md"))?.possibleCauses?.[0]).toBe("Did you mean `README.md`?");
    await run("git switch -c side");
    await files.writeFile(WS, "side.txt", "s\n");
    await run("git add side.txt");
    await run('git commit -m "Side"');
    await run("git switch main");
    await files.writeFile(WS, "main.txt", "m\n");
    await run("git add main.txt");
    await run('git commit -m "Main"');
    expect((await run("git merge --ff-only side"))?.code).toBe("NON_FAST_FORWARD");
    expect((await run("git branch -d side"))?.code).toBe("BRANCH_NOT_MERGED");
    expect((await run("git stash pop"))?.code).toBe("NO_STASH");
  });

  it("explains parser errors and the sandbox", async () => {
    expect(await run("ls -la")).toMatchObject({
      code: "COMMAND_NOT_FOUND",
      hints: ["The Files panel and the editor's explorer show every file."],
    });
    const typo = await run("git stauts");
    expect(typo?.code).toBe("UNKNOWN_GIT_COMMAND");
    expect(typo?.possibleCauses).toEqual(["Did you mean `status`?"]);
    expect((await run("git push"))?.title).toBe("GitDojo does not support that command yet");
    expect((await run("git status --short"))?.code).toBe("UNSUPPORTED_OPTION");
    expect((await run("git commit -m"))?.code).toBe("MISSING_VALUE");
    expect((await run('git commit -m "oops'))?.code).toBe("UNCLOSED_QUOTE");
    expect(await run("git init")).toBeNull();
    expect((await run("git commit"))?.code).toBe("COMMIT_MESSAGE_REQUIRED");
  });

  it("has an explanation for every educational code", () => {
    expect(EDUCATIONAL_CODES).toEqual(
      expect.arrayContaining([
        "NOT_A_REPOSITORY",
        "NOTHING_TO_COMMIT",
        "UNKNOWN_BRANCH",
        "UNSTAGED_CHANGES",
        "MERGE_CONFLICT",
        "DETACHED_HEAD",
        "NON_FAST_FORWARD",
        "INVALID_COMMIT",
        "BRANCH_ALREADY_EXISTS",
        "PATH_NOT_FOUND",
      ]),
    );
  });
});

describe("suggestions", () => {
  it("measures edit distance", () => {
    expect(editDistance("main", "mian")).toBe(2);
    expect(editDistance("status", "stauts")).toBe(2);
    expect(editDistance("", "abc")).toBe(3);
  });

  it("finds close candidates, ignoring case, and nothing for unrelated words", () => {
    expect(closestMatches("Main", ["main", "develop"])).toEqual(["main"]);
    expect(closestMatches("xyz", ["main", "develop"])).toEqual([]);
  });
});
