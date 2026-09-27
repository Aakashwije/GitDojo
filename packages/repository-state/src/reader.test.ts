import {
  createGitEngine,
  createLightningFs,
  type GitEngine,
  WorkspaceFileSystem,
} from "@gitdojo/git-engine";
import { beforeEach, describe, expect, it } from "vitest";
import { createRepositoryStateReader, type RepositoryStateReader } from "./reader";

const WS = "state-test";
let dbCounter = 0;

describe("RepositoryStateReader", () => {
  let files: WorkspaceFileSystem;
  let git: GitEngine;
  let reader: RepositoryStateReader;

  beforeEach(async () => {
    dbCounter += 1;
    const fs = createLightningFs(`state-test-${String(dbCounter)}`, { wipe: true });
    files = new WorkspaceFileSystem(fs);
    await files.createWorkspace(WS);
    git = createGitEngine({ fs, workspaceId: WS });
    reader = createRepositoryStateReader((workspaceId) => createGitEngine({ fs, workspaceId }));
  });

  it("describes a non-initialized directory", async () => {
    await files.writeFile(WS, "README.md", "x");
    expect(await reader.read(WS)).toEqual({
      initialized: false,
      currentBranch: null,
      head: null,
      branches: [],
      commits: [],
      files: [{ path: "README.md", status: "untracked" }],
      stagedFiles: [],
      conflicts: [],
    });
  });

  it("describes an empty repository", async () => {
    await git.init();
    expect(await reader.read(WS)).toEqual({
      initialized: true,
      currentBranch: "main",
      head: null,
      branches: [{ name: "main", oid: null, current: true }],
      commits: [],
      files: [],
      stagedFiles: [],
      conflicts: [],
    });
  });

  it("reports an untracked file", async () => {
    await files.writeFile(WS, "README.md", "x");
    await git.init();
    const state = await reader.read(WS);
    expect(state.files).toEqual([{ path: "README.md", status: "untracked" }]);
    expect(state.stagedFiles).toEqual([]);
  });

  it("reports a staged file", async () => {
    await files.writeFile(WS, "README.md", "x");
    await git.init();
    await git.add(["README.md"]);
    const state = await reader.read(WS);
    expect(state.files).toEqual([{ path: "README.md", status: "staged" }]);
    expect(state.stagedFiles).toEqual([{ path: "README.md", status: "staged", change: "added" }]);
  });

  it("reports a committed file and the commit", async () => {
    await files.writeFile(WS, "README.md", "x");
    await git.init();
    await git.add(["README.md"]);
    const commit = await git.commit({ message: "Initial commit" });
    const state = await reader.read(WS);
    expect(state.files).toEqual([{ path: "README.md", status: "committed" }]);
    expect(state.stagedFiles).toEqual([]);
    expect(state.head).toBe(commit.data?.oid);
    expect(state.branches).toEqual([{ name: "main", oid: commit.data?.oid, current: true }]);
    expect(state.commits).toEqual([
      {
        oid: commit.data?.oid,
        shortOid: commit.data?.shortOid,
        message: "Initial commit",
        authorName: "GitDojo Learner",
        authorEmail: "learner@gitdojo.local",
        timestamp: expect.any(Number) as number,
        parents: [],
      },
    ]);
  });

  it("reports multiple commits newest first with parent links", async () => {
    await files.writeFile(WS, "README.md", "one");
    await git.init();
    await git.add(["."]);
    await git.commit({ message: "First" });
    await files.writeFile(WS, "README.md", "two");
    await git.add(["."]);
    await git.commit({ message: "Second" });
    const { commits } = await reader.read(WS);
    expect(commits.map((commit) => commit.message)).toEqual(["Second", "First"]);
    expect(commits[0]?.parents).toEqual([commits[1]?.oid]);
  });

  it("separates staged and unstaged changes to the same file", async () => {
    await files.writeFile(WS, "README.md", "one");
    await git.init();
    await git.add(["README.md"]);
    await git.commit({ message: "First" });
    await files.writeFile(WS, "README.md", "two");
    await git.add(["README.md"]);
    await files.writeFile(WS, "README.md", "three");
    const state = await reader.read(WS);
    expect(state.files).toEqual([{ path: "README.md", status: "modified" }]);
    expect(state.stagedFiles).toEqual([
      { path: "README.md", status: "staged", change: "modified" },
    ]);
  });

  it("reports deletions", async () => {
    await files.writeFile(WS, "a.txt", "a");
    await git.init();
    await git.add(["."]);
    await git.commit({ message: "First" });
    await files.removeFile(WS, "a.txt");
    expect((await reader.read(WS)).files).toEqual([{ path: "a.txt", status: "deleted" }]);
    await git.add(["."]);
    const state = await reader.read(WS);
    expect(state.files).toEqual([]);
    expect(state.stagedFiles).toEqual([{ path: "a.txt", status: "staged", change: "deleted" }]);
  });
});
