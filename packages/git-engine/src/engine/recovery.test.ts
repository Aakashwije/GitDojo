import { describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";

async function write(ws: TestWorkspace, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await ws.files.writeFile(ws.workspaceId, path, content);
  }
}

async function commit(ws: TestWorkspace, message: string, files: Record<string, string>) {
  await write(ws, files);
  await ws.git.add(Object.keys(files));
  const result = await ws.git.commit({ message });
  expect(result.ok, result.output).toBe(true);
  return result.data?.oid ?? "";
}

const read = (ws: TestWorkspace, path: string) => ws.files.readFile(ws.workspaceId, path);
const exists = (ws: TestWorkspace, path: string) => ws.files.exists(ws.workspaceId, path);
const messages = async (ws: TestWorkspace) =>
  (await ws.git.snapshot()).commits.map((commit) => commit.message);

/** main: A (app.txt = 1..5 lines) → B (adds notes.md). */
async function repo() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  const a = await commit(ws, "A", { "app.txt": "one\ntwo\nthree\nfour\nfive\n" });
  const b = await commit(ws, "B", { "notes.md": "# Notes\n" });
  return { ws, a, b };
}

describe("git diff", () => {
  it("prints nothing without changes", async () => {
    const { ws } = await repo();
    expect(await ws.git.diff()).toMatchObject({ ok: true, output: "", data: { files: [] } });
  });

  it("shows unstaged changes as a unified diff with context", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "one\ntwo\nTHREE\nfour\nfive\nsix\n" });
    const result = await ws.git.diff();
    expect(result.output).toMatch(
      /^diff --git a\/app\.txt b\/app\.txt\nindex [0-9a-f]{7}\.\.[0-9a-f]{7} 100644\n--- a\/app\.txt\n\+\+\+ b\/app\.txt\n/,
    );
    expect(result.output.split("\n").slice(4)).toEqual([
      "@@ -1,5 +1,6 @@",
      " one",
      " two",
      "-three",
      "+THREE",
      " four",
      " five",
      "+six",
    ]);
    expect(result.data?.files[0]).toMatchObject({
      path: "app.txt",
      change: "modified",
      insertions: 2,
      deletions: 1,
    });
    // Once staged, the change moves from `git diff` to `git diff --staged`.
    await ws.git.add(["app.txt"]);
    expect((await ws.git.diff()).output).toBe("");
    expect((await ws.git.diff({ staged: true })).data?.files.map((f) => f.path)).toEqual([
      "app.txt",
    ]);
  });

  it("shows new and deleted files when staged, and ignores untracked ones", async () => {
    const { ws } = await repo();
    await write(ws, { "new.txt": "hello\n", "untracked.txt": "x\n" });
    await ws.git.add(["new.txt"]);
    await ws.files.removeFile(ws.workspaceId, "notes.md");
    await ws.git.add(["notes.md"]);
    const output = (await ws.git.diff({ staged: true })).output;
    expect(output).toContain(
      "diff --git a/new.txt b/new.txt\nnew file mode 100644\nindex 0000000..",
    );
    expect(output).toContain("--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hello");
    expect(output).toContain("deleted file mode 100644");
    expect(output).toContain("--- a/notes.md\n+++ /dev/null\n@@ -1 +0,0 @@\n-# Notes");
    expect(output).not.toContain("untracked.txt");
  });

  it("limits the diff to paths and notes a missing final newline", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "changed", "notes.md": "# Notes\nmore\n" });
    const result = await ws.git.diff({ paths: ["notes.md"] });
    expect(result.data?.files.map((file) => file.path)).toEqual(["notes.md"]);
    expect((await ws.git.diff({ paths: ["app.txt"] })).output).toContain(
      "+changed\n\\ No newline at end of file",
    );
  });

  it("splits far-apart changes into separate hunks", async () => {
    const ws = await createTestWorkspace();
    await ws.git.init();
    const lines = Array.from({ length: 20 }, (_, i) => `line ${String(i + 1)}\n`);
    await commit(ws, "A", { "long.txt": lines.join("") });
    const edited = [...lines];
    edited[1] = "LINE 2\n";
    edited[17] = "LINE 18\n";
    await write(ws, { "long.txt": edited.join("") });
    const hunks = (await ws.git.diff()).data?.files[0]?.hunks ?? [];
    expect(hunks.map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines])).toEqual([
      [1, 5, 1, 5],
      [15, 6, 15, 6],
    ]);
  });
});

describe("git restore", () => {
  it("discards unstaged edits and restores deleted files", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "broken\n" });
    await ws.files.removeFile(ws.workspaceId, "notes.md");
    expect(await ws.git.restore(["app.txt", "notes.md"])).toMatchObject({ ok: true, output: "" });
    expect(await read(ws, "app.txt")).toBe("one\ntwo\nthree\nfour\nfive\n");
    expect(await read(ws, "notes.md")).toBe("# Notes\n");
    expect((await ws.git.status()).output).toContain("nothing to commit, working tree clean");
  });

  it("unstages with --staged and keeps the edit", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "edited\n", "new.txt": "n\n" });
    await ws.git.add(["."]);
    await ws.git.restore(["."], { staged: true });
    const snapshot = await ws.git.snapshot();
    expect(snapshot.entries.filter((e) => e.staged !== null)).toEqual([]);
    expect(await read(ws, "app.txt")).toBe("edited\n");
    expect(snapshot.entries.find((e) => e.path === "new.txt")?.unstaged).toBe("untracked");
  });

  it("restores from the staging area, not HEAD, without --staged", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "staged\n" });
    await ws.git.add(["app.txt"]);
    await write(ws, { "app.txt": "later\n" });
    await ws.git.restore(["app.txt"]);
    expect(await read(ws, "app.txt")).toBe("staged\n");
  });

  it("takes content from another commit with --source", async () => {
    const { ws, a } = await repo();
    await commit(ws, "C", { "app.txt": "rewritten\n" });
    await ws.git.restore(["app.txt"], { source: a.slice(0, 7) });
    expect(await read(ws, "app.txt")).toBe("one\ntwo\nthree\nfour\nfive\n");
    expect((await ws.git.restore(["app.txt"], { source: "nope" })).error?.code).toBe(
      "INVALID_REVISION",
    );
  });

  it("refuses unknown paths and paths outside the repository", async () => {
    const { ws } = await repo();
    await write(ws, { "untracked.txt": "x\n" });
    expect(await ws.git.restore(["untracked.txt"])).toMatchObject({
      ok: false,
      output: "error: pathspec 'untracked.txt' did not match any file(s) known to git",
    });
    expect((await ws.git.restore(["../etc/passwd"])).error?.code).toBe("INVALID_ARGUMENT");
    expect((await ws.git.restore([])).output).toContain("you must specify path(s) to restore");
  });
});

describe("git reset", () => {
  async function threeCommits() {
    const { ws, a, b } = await repo();
    const c = await commit(ws, "C", { "app.txt": "one\ntwo\nthree\nfour\nfive\nsix\n" });
    return { ws, a, b, c };
  }

  it("--soft moves the branch and keeps the changes staged", async () => {
    const { ws, b } = await threeCommits();
    expect(await ws.git.reset({ mode: "soft", commit: "HEAD~1" })).toMatchObject({
      ok: true,
      output: "",
      data: { mode: "soft", to: b },
    });
    expect(await messages(ws)).toEqual(["B", "A"]);
    const staged = (await ws.git.snapshot()).entries.filter((e) => e.staged !== null);
    expect(staged.map((e) => e.path)).toEqual(["app.txt"]);
  });

  it("--mixed (the default) unstages the changes but keeps them in the files", async () => {
    const { ws } = await threeCommits();
    const result = await ws.git.reset({ commit: "HEAD~1" });
    expect(result.output).toBe("Unstaged changes after reset:\nM\tapp.txt");
    expect(await read(ws, "app.txt")).toContain("six");
    const entry = (await ws.git.snapshot()).entries.find((e) => e.path === "app.txt");
    expect(entry).toMatchObject({ staged: null, unstaged: "modified" });
  });

  it("--hard throws the changes away but leaves untracked files alone", async () => {
    const { ws, a } = await threeCommits();
    await write(ws, { "scratch.txt": "keep me\n", "app.txt": "local edit\n" });
    const result = await ws.git.reset({ mode: "hard", commit: "HEAD~2" });
    expect(result.output).toBe(`HEAD is now at ${a.slice(0, 7)} A`);
    expect(await messages(ws)).toEqual(["A"]);
    expect(await read(ws, "app.txt")).toBe("one\ntwo\nthree\nfour\nfive\n");
    expect(await exists(ws, "notes.md")).toBe(false);
    expect(await read(ws, "scratch.txt")).toBe("keep me\n");
    expect((await ws.git.status()).output).toContain("Untracked files:");
  });

  it("records the move in the reflog, so the commits can be found again", async () => {
    const { ws, c } = await threeCommits();
    await ws.git.reset({ mode: "hard", commit: "HEAD~2" });
    const reflog = await ws.git.reflog();
    expect(reflog.output.split("\n")[0]).toMatch(
      /^[0-9a-f]{7} \(HEAD -> main\) HEAD@\{0\}: reset: moving to HEAD~2$/,
    );
    expect(reflog.data?.entries[1]?.oid).toBe(c);
    await ws.git.reset({ mode: "hard", commit: "HEAD@{1}" });
    expect(await messages(ws)).toEqual(["C", "B", "A"]);
  });

  it("unstages paths with `git reset <path>`", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "x\n", "notes.md": "y\n" });
    await ws.git.add(["."]);
    const result = await ws.git.reset({ paths: ["app.txt"] });
    expect(result.data?.paths).toEqual(["app.txt"]);
    const staged = (await ws.git.snapshot()).entries.filter((e) => e.staged !== null);
    expect(staged.map((e) => e.path)).toEqual(["notes.md"]);
    expect((await ws.git.reset({ mode: "hard", paths: ["app.txt"] })).output).toBe(
      "fatal: Cannot do hard reset with paths.",
    );
  });

  it("empties the staging area on an unborn branch", async () => {
    const ws = await createTestWorkspace({ "a.txt": "a" });
    await ws.git.init();
    await ws.git.add(["a.txt"]);
    expect((await ws.git.reset()).ok).toBe(true);
    expect((await ws.git.snapshot()).entries[0]?.unstaged).toBe("untracked");
  });

  it("rejects unknown commits and soft resets during a merge, and hard resets abandon a merge", async () => {
    const { ws } = await repo();
    expect((await ws.git.reset({ commit: "nope" })).output).toContain(
      "fatal: ambiguous argument 'nope': unknown revision",
    );
    await ws.git.createAndSwitchBranch("other");
    await commit(ws, "Other", { "app.txt": "other\n" });
    await ws.git.switchBranch("main");
    await commit(ws, "Main", { "app.txt": "main\n" });
    expect((await ws.git.merge("other")).error?.code).toBe("MERGE_CONFLICT");
    expect((await ws.git.reset({ mode: "soft" })).output).toBe(
      "fatal: Cannot do a soft reset in the middle of a merge.",
    );
    await ws.git.reset({ mode: "hard" });
    expect((await ws.git.snapshot()).merge).toBeNull();
    expect(await read(ws, "app.txt")).toBe("main\n");
  });
});

describe("git revert", () => {
  it("adds a commit that undoes another, keeping history", async () => {
    const { ws, b } = await repo();
    const result = await ws.git.revert("HEAD");
    expect(result.ok, result.output).toBe(true);
    expect(result.output).toMatch(
      /^\[main [0-9a-f]{7}\] Revert "B"\n 1 file changed, 1 deletion\(-\)\n delete mode 100644 notes\.md$/,
    );
    expect(await exists(ws, "notes.md")).toBe(false);
    const [revert] = (await ws.git.snapshot()).commits;
    expect(revert?.message).toBe(`Revert "B"\n\nThis reverts commit ${b}.`);
    expect(await messages(ws)).toHaveLength(3);
    expect((await ws.git.reflog()).data?.entries[0]?.message).toBe('revert: Revert "B"');
  });

  it("stops on conflicts and continues with git revert --continue", async () => {
    const { ws } = await repo();
    await commit(ws, "Shout", { "app.txt": "ONE\ntwo\nthree\nfour\nfive\n" });
    await commit(ws, "Whisper", { "app.txt": "one!\ntwo\nthree\nfour\nfive\n" });
    const result = await ws.git.revert("HEAD~1");
    expect(result.error?.code).toBe("MERGE_CONFLICT");
    expect(result.output).toContain("CONFLICT (content): Merge conflict in app.txt");
    expect(result.output).toMatch(/error: could not revert [0-9a-f]{7}\.\.\. Shout/);
    expect(await read(ws, "app.txt")).toContain(">>>>>>> parent of ");
    expect((await ws.git.status()).output).toMatch(
      /You are currently reverting commit [0-9a-f]{7}\./,
    );
    expect((await ws.git.snapshot()).merge?.kind).toBe("revert");

    expect((await ws.git.sequencer("revert", "continue")).error?.code).toBe("UNRESOLVED_CONFLICTS");
    await write(ws, { "app.txt": "one\ntwo\nthree\nfour\nfive\n" });
    await ws.git.add(["app.txt"]);
    const done = await ws.git.sequencer("revert", "continue");
    expect(done.ok, done.output).toBe(true);
    expect((await ws.git.snapshot()).commits[0]?.message).toMatch(/^Revert "Shout"/);
    expect((await ws.git.snapshot()).merge).toBeNull();
  });

  it("aborts back to where it started", async () => {
    const { ws } = await repo();
    await commit(ws, "Shout", { "app.txt": "ONE\ntwo\nthree\nfour\nfive\n" });
    await commit(ws, "Whisper", { "app.txt": "one!\ntwo\nthree\nfour\nfive\n" });
    await ws.git.revert("HEAD~1");
    expect((await ws.git.sequencer("revert", "abort")).ok).toBe(true);
    expect(await read(ws, "app.txt")).toBe("one!\ntwo\nthree\nfour\nfive\n");
    expect((await ws.git.status()).output).toContain("nothing to commit, working tree clean");
    expect((await ws.git.sequencer("revert", "abort")).error?.code).toBe("NO_OPERATION");
  });

  it("refuses merge commits, unknown commits, and local changes in the way", async () => {
    const { ws } = await repo();
    expect((await ws.git.revert("nope")).output).toBe("fatal: bad revision 'nope'");
    await write(ws, { "notes.md": "local\n" });
    expect((await ws.git.revert("HEAD")).error?.code).toBe("LOCAL_CHANGES");
    await ws.git.restore(["notes.md"]);
    await ws.git.createAndSwitchBranch("side");
    await commit(ws, "Side", { "side.txt": "s\n" });
    await ws.git.switchBranch("main");
    await commit(ws, "Main", { "main.txt": "m\n" });
    await ws.git.merge("side");
    expect((await ws.git.revert("HEAD")).output).toContain("is a merge but no -m option was given");
  });
});

describe("git cherry-pick", () => {
  async function branches() {
    const { ws } = await repo();
    await ws.git.createAndSwitchBranch("feature");
    const fix = await commit(ws, "Fix typo", { "notes.md": "# Notes (fixed)\n" });
    const wip = await commit(ws, "WIP charts", { "charts.js": "draw();\n" });
    await ws.git.switchBranch("main");
    await commit(ws, "Main work", { "main.txt": "m\n" });
    return { ws, fix, wip };
  }

  it("copies one commit onto the current branch, keeping message and author", async () => {
    const { ws, fix } = await branches();
    const result = await ws.git.cherryPick(fix.slice(0, 7));
    expect(result.ok, result.output).toBe(true);
    expect(result.output).toMatch(
      /^\[main [0-9a-f]{7}\] Fix typo\n Date: .+\n 1 file changed, 1 insertion\(\+\), 1 deletion\(-\)$/,
    );
    expect(await read(ws, "notes.md")).toBe("# Notes (fixed)\n");
    expect(await exists(ws, "charts.js")).toBe(false);
    const [copy] = (await ws.git.snapshot()).commits;
    expect(copy?.oid).not.toBe(fix);
    expect(copy?.message).toBe("Fix typo");
    expect((await ws.git.reflog()).data?.entries[0]?.message).toBe("cherry-pick: Fix typo");
  });

  it("reports an empty pick when the change is already there", async () => {
    const { ws, fix } = await branches();
    await ws.git.cherryPick(fix);
    const again = await ws.git.cherryPick(fix);
    expect(again.error?.code).toBe("EMPTY_COMMIT");
    expect(again.output).toContain("The previous cherry-pick is now empty");
  });

  it("stops on conflicts and finishes with git commit", async () => {
    const { ws, fix } = await branches();
    await commit(ws, "Rename notes", { "notes.md": "# Journal\n" });
    const result = await ws.git.cherryPick(fix);
    expect(result.error?.code).toBe("MERGE_CONFLICT");
    expect(result.output).toContain('hint: "git cherry-pick --continue".');
    expect(await read(ws, "notes.md")).toMatch(/>>>>>>> [0-9a-f]{7} \(Fix typo\)/);
    expect((await ws.git.status()).output).toMatch(/You are currently cherry-picking commit/);
    await write(ws, { "notes.md": "# Journal (fixed)\n" });
    await ws.git.add(["notes.md"]);
    const done = await ws.git.commit({ message: "" });
    expect(done.ok, done.output).toBe(true);
    expect((await ws.git.snapshot()).commits[0]?.message).toBe("Fix typo");
    expect((await ws.git.snapshot()).merge).toBeNull();
  });

  it("refuses to start while another operation is in progress", async () => {
    const { ws, fix, wip } = await branches();
    await commit(ws, "Rename notes", { "notes.md": "# Journal\n" });
    await ws.git.cherryPick(fix);
    expect((await ws.git.cherryPick(wip)).output).toContain(
      "error: a cherry-pick is already in progress",
    );
    expect((await ws.git.switchBranch("feature")).error?.code).toBe("MERGE_IN_PROGRESS");
  });
});

describe("git stash", () => {
  it("saves staged and unstaged work and restores a clean tree", async () => {
    const { ws, b } = await repo();
    await write(ws, { "app.txt": "edited\n", "new.txt": "new\n", "untracked.txt": "u\n" });
    await ws.git.add(["new.txt"]);
    const result = await ws.git.stashPush();
    expect(result.output).toBe(
      `Saved working directory and index state WIP on main: ${b.slice(0, 7)} B`,
    );
    expect(await read(ws, "app.txt")).toBe("one\ntwo\nthree\nfour\nfive\n");
    expect(await exists(ws, "new.txt")).toBe(false);
    // Untracked files stay unless -u is given.
    expect(await read(ws, "untracked.txt")).toBe("u\n");
    expect((await ws.git.stashList()).output).toBe(`stash@{0}: WIP on main: ${b.slice(0, 7)} B`);
    expect((await ws.git.snapshot()).stashes).toMatchObject([
      { index: 0, paths: ["app.txt", "new.txt"] },
    ]);
  });

  it("pops the newest entry back, new files staged and edits unstaged", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "edited\n", "new.txt": "new\n" });
    await ws.git.add(["new.txt", "app.txt"]);
    await ws.git.stashPush({ message: "half done" });
    expect((await ws.git.stashList()).output).toBe("stash@{0}: On main: half done");

    const result = await ws.git.stashApply(undefined, { pop: true });
    expect(result.ok, result.output).toBe(true);
    expect(result.output).toMatch(/Dropped refs\/stash@\{0\} \([0-9a-f]{40}\)$/);
    expect(await read(ws, "app.txt")).toBe("edited\n");
    const entries = (await ws.git.snapshot()).entries;
    expect(entries.find((e) => e.path === "new.txt")?.staged).toBe("added");
    expect(entries.find((e) => e.path === "app.txt")).toMatchObject({
      staged: null,
      unstaged: "modified",
    });
    expect((await ws.git.snapshot()).stashes).toEqual([]);
  });

  it("applies onto a moved HEAD, merging both changes", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "one\ntwo\nthree\nfour\nFIVE\n" });
    await ws.git.stashPush();
    await commit(ws, "Shout", { "app.txt": "ONE\ntwo\nthree\nfour\nfive\n" });
    const result = await ws.git.stashApply("stash@{0}");
    expect(result.ok, result.output).toBe(true);
    expect(await read(ws, "app.txt")).toBe("ONE\ntwo\nthree\nfour\nFIVE\n");
    // apply keeps the entry; drop removes it.
    expect((await ws.git.snapshot()).stashes).toHaveLength(1);
    expect((await ws.git.stashDrop("0")).output).toMatch(/^Dropped refs\/stash@\{0\} /);
  });

  it("leaves conflict markers and keeps the entry when a pop conflicts", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "mine\ntwo\nthree\nfour\nfive\n" });
    await ws.git.stashPush();
    await commit(ws, "Theirs", { "app.txt": "theirs\ntwo\nthree\nfour\nfive\n" });
    const result = await ws.git.stashApply(undefined, { pop: true });
    expect(result.error?.code).toBe("MERGE_CONFLICT");
    expect(result.output).toContain("CONFLICT (content): Merge conflict in app.txt");
    expect(result.output).toContain("The stash entry is kept in case you need it again.");
    expect(await read(ws, "app.txt")).toContain("<<<<<<< Updated upstream");
    expect((await ws.git.snapshot()).stashes).toHaveLength(1);
  });

  it("refuses to overwrite local changes and handles bad references", async () => {
    const { ws } = await repo();
    expect((await ws.git.stashPush()).output).toBe("No local changes to save");
    expect((await ws.git.stashApply()).output).toBe("No stash entries found.");
    await write(ws, { "app.txt": "stashed\n" });
    await ws.git.stashPush();
    await write(ws, { "app.txt": "local\n" });
    const blocked = await ws.git.stashApply();
    expect(blocked.error?.code).toBe("LOCAL_CHANGES");
    expect(blocked.output).toContain("\tapp.txt");
    expect((await ws.git.stashDrop("stash@{3}")).output).toBe(
      "error: stash@{3} is not a valid reference",
    );
  });

  it("stashes untracked files with -u and shows a diffstat", async () => {
    const { ws } = await repo();
    await write(ws, { "app.txt": "one\ntwo\n", "todo.txt": "t\n" });
    await ws.git.stashPush({ includeUntracked: true });
    expect(await exists(ws, "todo.txt")).toBe(false);
    expect((await ws.git.stashShow()).output).toBe(
      " app.txt | 3 ---\n 1 file changed, 3 deletions(-)",
    );
    await ws.git.stashApply();
    expect(await read(ws, "todo.txt")).toBe("t\n");
  });
});

describe("git rebase", () => {
  /** main: A, B, M1 ; feature (from B): F1, F2. */
  async function diverged() {
    const { ws } = await repo();
    await ws.git.createAndSwitchBranch("feature");
    await commit(ws, "F1", { "search.js": "search();\n" });
    await commit(ws, "F2", { "search.css": ".hit {}\n" });
    await ws.git.switchBranch("main");
    const m1 = await commit(ws, "M1", { "app.txt": "one\ntwo\nthree\nfour\nfive\nsix\n" });
    await ws.git.switchBranch("feature");
    return { ws, m1 };
  }

  it("replays the branch's commits on top of the upstream", async () => {
    const { ws, m1 } = await diverged();
    const result = await ws.git.rebase("main");
    expect(result).toMatchObject({
      ok: true,
      output: "Successfully rebased and updated refs/heads/feature.",
      data: { status: "rebased" },
    });
    const snapshot = await ws.git.snapshot();
    expect(snapshot.currentBranch).toBe("feature");
    expect(snapshot.commits.map((c) => c.message)).toEqual(["F2", "F1", "M1", "B", "A"]);
    expect(snapshot.commits[2]?.oid).toBe(m1);
    // A straight line now: no merge commits.
    expect(snapshot.commits.every((c) => c.parents.length <= 1)).toBe(true);
    expect(await read(ws, "app.txt")).toContain("six");
    const reflog = snapshot.reflog.map((entry) => entry.message);
    expect(reflog.slice(0, 4)).toEqual([
      "rebase (finish): returning to refs/heads/feature",
      "rebase (pick): F2",
      "rebase (pick): F1",
      "rebase (start): checkout main",
    ]);
  });

  it("reports up to date, and fast-forwards a branch with nothing of its own", async () => {
    const { ws } = await diverged();
    await ws.git.rebase("main");
    expect((await ws.git.rebase("main")).output).toBe("Current branch feature is up to date.");
    await ws.git.switchBranch("main");
    const ff = await ws.git.rebase("feature");
    expect(ff.data?.status).toBe("fast-forward");
    expect((await ws.git.snapshot()).commits[0]?.message).toBe("F2");
  });

  it("stops on a conflict, then continues after it is resolved", async () => {
    const { ws } = await diverged();
    await commit(ws, "F3", { "app.txt": "ONE\ntwo\nthree\nfour\nfive\n" });
    await ws.git.switchBranch("main");
    await commit(ws, "M2", { "app.txt": "uno\ntwo\nthree\nfour\nfive\nsix\n" });
    await ws.git.switchBranch("feature");

    const stopped = await ws.git.rebase("main");
    expect(stopped.error?.code).toBe("MERGE_CONFLICT");
    expect(stopped.output).toMatch(/Could not apply [0-9a-f]{7}\.\.\. F3$/);
    const status = (await ws.git.status()).output;
    expect(status).toMatch(/^rebase in progress; onto [0-9a-f]{7}\n/);
    expect(status).toContain("You are currently rebasing branch 'feature' on");
    expect((await ws.git.snapshot()).merge).toMatchObject({
      kind: "rebase",
      rebase: { branch: "feature", remaining: 0 },
    });

    await write(ws, { "app.txt": "UNO\ntwo\nthree\nfour\nfive\nsix\n" });
    expect((await ws.git.rebaseControl("continue")).error?.code).toBe("UNRESOLVED_CONFLICTS");
    await ws.git.add(["app.txt"]);
    const done = await ws.git.rebaseControl("continue");
    expect(done.output).toBe("Successfully rebased and updated refs/heads/feature.");
    expect(await messages(ws)).toEqual(["F3", "F2", "F1", "M2", "M1", "B", "A"]);
  });

  it("aborts back to the original branch, or skips the conflicting commit", async () => {
    const { ws } = await diverged();
    const before = (await ws.git.snapshot()).head;
    await commit(ws, "F3", { "app.txt": "ONE\ntwo\nthree\nfour\nfive\n" });
    const tip = (await ws.git.snapshot()).head;
    await ws.git.switchBranch("main");
    await commit(ws, "M2", { "app.txt": "uno\ntwo\nthree\nfour\nfive\nsix\n" });
    await ws.git.switchBranch("feature");

    await ws.git.rebase("main");
    expect((await ws.git.rebaseControl("abort")).ok).toBe(true);
    const aborted = await ws.git.snapshot();
    expect(aborted).toMatchObject({ currentBranch: "feature", head: tip, merge: null });
    expect(await read(ws, "app.txt")).toBe("ONE\ntwo\nthree\nfour\nfive\n");
    expect(before).not.toBe(tip);

    await ws.git.rebase("main");
    const skipped = await ws.git.rebaseControl("skip");
    expect(skipped.ok, skipped.output).toBe(true);
    expect(await messages(ws)).toEqual(["F2", "F1", "M2", "M1", "B", "A"]);
    expect((await ws.git.rebaseControl("continue")).output).toBe("fatal: No rebase in progress?");
  });

  it("refuses with local changes, unknown upstreams and detached HEADs", async () => {
    const { ws } = await diverged();
    expect((await ws.git.rebase("nope")).output).toBe("fatal: invalid upstream 'nope'");
    await write(ws, { "search.js": "dirty\n" });
    expect((await ws.git.rebase("main")).output).toContain("You have unstaged changes.");
    await ws.git.restore(["search.js"]);
    await ws.git.detachHead("HEAD");
    expect((await ws.git.rebase("main")).error?.code).toBe("NOT_ON_BRANCH");
  });
});

describe("git rm", () => {
  it("deletes tracked files and stages the deletion", async () => {
    const { ws } = await repo();
    expect(await ws.git.rm(["notes.md"])).toMatchObject({ ok: true, output: "rm 'notes.md'" });
    expect(await exists(ws, "notes.md")).toBe(false);
    expect((await ws.git.snapshot()).entries.find((e) => e.path === "notes.md")?.staged).toBe(
      "deleted",
    );
  });

  it("stops tracking with --cached, needs -r for folders and protects local changes", async () => {
    const { ws } = await repo();
    await commit(ws, "Docs", { "docs/a.md": "a\n", "docs/b.md": "b\n" });
    expect((await ws.git.rm(["docs"])).output).toBe(
      "fatal: not removing 'docs' recursively without -r",
    );
    expect((await ws.git.rm(["docs"], { recursive: true, cached: true })).output).toBe(
      "rm 'docs/a.md'\nrm 'docs/b.md'",
    );
    expect(await read(ws, "docs/a.md")).toBe("a\n");
    await write(ws, { "app.txt": "changed\n" });
    expect((await ws.git.rm(["app.txt"])).error?.code).toBe("LOCAL_CHANGES");
    expect((await ws.git.rm(["app.txt"], { force: true })).ok).toBe(true);
    expect((await ws.git.rm(["nope"])).output).toBe(
      "fatal: pathspec 'nope' did not match any files",
    );
  });
});

describe("git log with a revision or --all", () => {
  it("lists another branch's history, or every branch's", async () => {
    const { ws } = await repo();
    await ws.git.createAndSwitchBranch("side");
    await commit(ws, "Side", { "side.txt": "s\n" });
    await ws.git.switchBranch("main");
    await commit(ws, "Main", { "main.txt": "m\n" });

    const side = await ws.git.log({ oneline: true, revision: "side" });
    expect(side.output.split("\n").map((line) => line.slice(8))).toEqual(["(side) Side", "B", "A"]);
    const all = await ws.git.log({ oneline: true, all: true });
    expect(all.data?.commits.map((c) => c.message).sort()).toEqual(["A", "B", "Main", "Side"]);
    expect((await ws.git.log({ revision: "nope" })).error?.code).toBe("INVALID_REVISION");
  });
});
