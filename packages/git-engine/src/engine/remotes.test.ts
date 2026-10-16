import { describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";

async function commit(ws: TestWorkspace, message: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await ws.files.writeFile(ws.workspaceId, path, content);
  }
  await ws.git.add(Object.keys(files));
  const result = await ws.git.commit({ message });
  expect(result.ok, result.output).toBe(true);
  return result.data?.oid ?? "";
}

/** A clone of a simulated `origin` whose `main` has one commit we have not fetched yet. */
async function cloned({ teammate = true }: { teammate?: boolean } = {}) {
  const ws = await createTestWorkspace();
  await ws.git.init();
  const base = await commit(ws, "Initial commit", { "README.md": "# Weather\n" });
  expect((await ws.git.setupRemote("origin", { branches: ["main"] })).ok).toBe(true);
  let theirs = base;
  if (teammate) {
    const result = await ws.git.setupRemoteCommit("origin", {
      branch: "main",
      message: "Fix units in header",
      files: { "header.js": "export const units = 'C';\n" },
    });
    expect(result.ok, result.output).toBe(true);
    theirs = (await ws.git.snapshot()).remotes[0]?.branches[0]?.oid ?? "";
  }
  return { ws, base, theirs };
}

const tracking = async (ws: TestWorkspace, name = "origin/main") =>
  (await ws.git.snapshot()).remoteBranches.find((ref) => ref.name === name)?.oid;

describe("simulated remotes", () => {
  it("are listed with a URL that cannot be mistaken for a real one", async () => {
    const { ws } = await cloned();
    expect((await ws.git.listRemotes()).output).toBe("origin");
    expect((await ws.git.listRemotes({ verbose: true })).output).toBe(
      "origin\tgitdojo://simulated/origin.git (fetch)\norigin\tgitdojo://simulated/origin.git (push)",
    );
  });

  it("start like a clone: main tracks origin/main and the server's new commit is unseen", async () => {
    const { ws, base, theirs } = await cloned();
    const snapshot = await ws.git.snapshot();
    expect(snapshot.branches[0]?.upstream).toEqual({
      name: "origin/main",
      ahead: 0,
      behind: 0,
      gone: false,
    });
    expect(snapshot.remoteBranches).toEqual([
      { name: "origin/main", remote: "origin", branch: "main", oid: base },
    ]);
    // The teammate's commit is on the server only: no local ref reaches it.
    expect(snapshot.allCommits.map((c) => c.oid)).not.toContain(theirs);
    expect(snapshot.remotes[0]?.branches).toEqual([{ name: "main", oid: theirs }]);
    expect((await ws.git.status()).output).toBe(
      "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean",
    );
  });

  describe("git fetch", () => {
    it("moves origin/main without touching the branch or the files", async () => {
      const { ws, base, theirs } = await cloned();
      const result = await ws.git.fetch();
      expect(result.output).toBe(
        [
          "From gitdojo://simulated/origin.git",
          `   ${base.slice(0, 7)}..${theirs.slice(0, 7)}  main       -> origin/main`,
        ].join("\n"),
      );
      expect(await tracking(ws)).toBe(theirs);
      const snapshot = await ws.git.snapshot();
      expect(snapshot.head).toBe(base);
      expect(snapshot.entries.map((entry) => entry.path)).toEqual(["README.md"]);
      expect(snapshot.branches[0]?.upstream).toMatchObject({ ahead: 0, behind: 1 });
      expect((await ws.git.status()).output).toContain(
        "Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.",
      );
      expect((await ws.git.log({ all: true, oneline: true })).output).toContain(
        "(origin/main) Fix units in header",
      );
    });

    it("prints nothing when there is nothing new", async () => {
      const { ws } = await cloned({ teammate: false });
      expect(await ws.git.fetch("origin")).toMatchObject({ ok: true, output: "" });
    });

    it("refuses an unknown remote and a repository without remotes", async () => {
      const { ws } = await cloned();
      const unknown = await ws.git.fetch("upstream");
      expect(unknown.error?.code).toBe("REMOTE_NOT_FOUND");
      expect(unknown.output).toMatch(/^fatal: 'upstream' does not appear to be a git repository/);
      const bare = await createTestWorkspace();
      await bare.git.init();
      expect((await bare.git.fetch()).error?.code).toBe("REMOTE_NOT_FOUND");
    });
  });

  describe("git pull", () => {
    it("fast-forwards onto what it fetched", async () => {
      const { ws, theirs } = await cloned();
      const result = await ws.git.pull();
      expect(result.ok, result.output).toBe(true);
      expect(result.data?.status).toBe("fast-forward");
      expect(result.output).toMatch(/^From gitdojo:\/\/simulated\/origin\.git\n.*\nUpdating /);
      expect((await ws.git.snapshot()).head).toBe(theirs);
      expect(await ws.files.readFile(ws.workspaceId, "header.js")).toBe(
        "export const units = 'C';\n",
      );
      expect((await ws.git.pull()).output).toBe("Already up to date.");
    });

    it("refuses divergent branches until told how, but has fetched already", async () => {
      const { ws, theirs } = await cloned();
      const mine = await commit(ws, "Add forecast panel", { "forecast.js": "export {};\n" });
      const refused = await ws.git.pull();
      expect(refused.ok).toBe(false);
      expect(refused.error?.code).toBe("DIVERGENT_BRANCHES");
      expect(refused.output).toContain(
        "fatal: Need to specify how to reconcile divergent branches.",
      );
      expect(await tracking(ws)).toBe(theirs);
      expect((await ws.git.snapshot()).head).toBe(mine);
      expect((await ws.git.status()).output).toContain(
        "Your branch and 'origin/main' have diverged,\nand have 1 and 1 different commits each, respectively.",
      );
    });

    it("rebases with --rebase and merges with --no-rebase", async () => {
      const rebased = await cloned();
      await commit(rebased.ws, "Add forecast panel", { "forecast.js": "export {};\n" });
      const result = await rebased.ws.git.pull({ mode: "rebase" });
      expect(result.ok, result.output).toBe(true);
      expect(result.data?.status).toBe("rebased");
      const history = (await rebased.ws.git.snapshot()).commits.map((c) => c.message);
      expect(history).toEqual(["Add forecast panel", "Fix units in header", "Initial commit"]);

      const merged = await cloned();
      await commit(merged.ws, "Add forecast panel", { "forecast.js": "export {};\n" });
      const merge = await merged.ws.git.pull({ mode: "merge" });
      expect(merge.data?.status).toBe("merge-commit");
      expect((await merged.ws.git.snapshot()).commits[0]?.message).toBe(
        "Merge branch 'main' of gitdojo://simulated/origin.git",
      );

      const ffOnly = await cloned();
      await commit(ffOnly.ws, "Add forecast panel", { "forecast.js": "export {};\n" });
      expect((await ffOnly.ws.git.pull({ mode: "ff-only" })).error?.code).toBe("NOT_FAST_FORWARD");
    });

    it("needs an upstream when given no remote", async () => {
      const { ws } = await cloned();
      await ws.git.createAndSwitchBranch("feature/alerts");
      const result = await ws.git.pull();
      expect(result.error?.code).toBe("NO_UPSTREAM");
      expect(result.output).toMatch(/^There is no tracking information for the current branch\./);
    });
  });

  describe("git push", () => {
    it("publishes new commits and moves origin/main", async () => {
      const { ws, base } = await cloned({ teammate: false });
      const mine = await commit(ws, "Add forecast panel", { "forecast.js": "export {};\n" });
      expect((await ws.git.status()).output).toContain(
        "Your branch is ahead of 'origin/main' by 1 commit.\n  (use \"git push\" to publish your local commits)",
      );
      const result = await ws.git.push();
      expect(result.output).toBe(
        `To gitdojo://simulated/origin.git\n   ${base.slice(0, 7)}..${mine.slice(0, 7)}  main -> main`,
      );
      const snapshot = await ws.git.snapshot();
      expect(snapshot.remotes[0]?.branches).toEqual([{ name: "main", oid: mine }]);
      expect(await tracking(ws)).toBe(mine);
      expect((await ws.git.push()).output).toBe("Everything up-to-date");
    });

    it("rejects a push that would lose the server's commits", async () => {
      const { ws, theirs } = await cloned();
      await commit(ws, "Add forecast panel", { "forecast.js": "export {};\n" });
      const fetchFirst = await ws.git.push();
      expect(fetchFirst.ok).toBe(false);
      expect(fetchFirst.error?.code).toBe("PUSH_REJECTED");
      expect(fetchFirst.output).toContain(" ! [rejected]        main -> main (fetch first)");
      expect((await ws.git.snapshot()).remotes[0]?.branches[0]?.oid).toBe(theirs);
      // Once fetched, Git knows the commit and calls it what it is.
      await ws.git.fetch();
      expect((await ws.git.push()).output).toContain("main -> main (non-fast-forward)");
      // Integrating first makes the push a fast-forward.
      await ws.git.pull({ mode: "rebase" });
      const pushed = await ws.git.push();
      expect(pushed.ok, pushed.output).toBe(true);
    });

    it("needs -u for a branch without an upstream, then remembers it", async () => {
      const { ws } = await cloned({ teammate: false });
      await ws.git.createAndSwitchBranch("feature/alerts");
      const alerts = await commit(ws, "Add alerts", { "alerts.js": "export {};\n" });
      const refused = await ws.git.push();
      expect(refused.error?.code).toBe("NO_UPSTREAM");
      // `-u` alone does not name a branch either, as in Git.
      expect((await ws.git.push({ setUpstream: true })).error?.code).toBe("NO_UPSTREAM");
      expect(refused.output).toContain("git push --set-upstream origin feature/alerts");
      const pushed = await ws.git.push({
        remote: "origin",
        branch: "feature/alerts",
        setUpstream: true,
      });
      expect(pushed.output).toBe(
        [
          "To gitdojo://simulated/origin.git",
          " * [new branch]      feature/alerts -> feature/alerts",
          "branch 'feature/alerts' set up to track 'origin/feature/alerts'.",
        ].join("\n"),
      );
      const snapshot = await ws.git.snapshot();
      expect(snapshot.branches.find((b) => b.name === "feature/alerts")?.upstream).toEqual({
        name: "origin/feature/alerts",
        ahead: 0,
        behind: 0,
        gone: false,
      });
      expect(snapshot.remotes[0]?.branches).toContainEqual({ name: "feature/alerts", oid: alerts });
      const verbose = await ws.git.showBranches({ verbose: true });
      expect(verbose.output).toMatch(
        /\* feature\/alerts [0-9a-f]{7} \[origin\/feature\/alerts\] Add alerts/,
      );
      expect((await ws.git.showBranches({ remotes: true })).output).toBe(
        "  origin/feature/alerts\n  origin/main",
      );
    });

    it("refuses unknown remotes, unknown branches and a detached HEAD", async () => {
      const { ws } = await cloned({ teammate: false });
      expect((await ws.git.push({ remote: "upstream", branch: "main" })).error?.code).toBe(
        "REMOTE_NOT_FOUND",
      );
      expect((await ws.git.push({ remote: "origin", branch: "nope" })).error?.code).toBe(
        "BRANCH_NOT_FOUND",
      );
      await ws.git.detachHead("HEAD");
      expect((await ws.git.push()).error?.code).toBe("NOT_ON_BRANCH");
    });
  });

  describe("tracking branches", () => {
    it("are created by switching to a branch only the remote has", async () => {
      const { ws } = await cloned({ teammate: false });
      await ws.git.setupRemoteCommit("origin", {
        branch: "feature/search",
        message: "Add search",
        files: { "search.js": "export {};\n" },
      });
      await ws.git.fetch();
      const switched = await ws.git.switchBranch("feature/search");
      expect(switched.output).toBe(
        "branch 'feature/search' set up to track 'origin/feature/search'.\nSwitched to a new branch 'feature/search'",
      );
      expect(
        (await ws.git.snapshot()).branches.find((b) => b.name === "feature/search")?.upstream?.name,
      ).toBe("origin/feature/search");
      expect(await ws.files.readFile(ws.workspaceId, "search.js")).toBe("export {};\n");
    });

    it("merge and rebase accept origin/main", async () => {
      const { ws, theirs } = await cloned();
      await ws.git.fetch();
      const merged = await ws.git.merge("origin/main");
      expect(merged.data?.type).toBe("fast-forward");
      expect((await ws.git.snapshot()).head).toBe(theirs);
    });
  });
});
