import { describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";
import { type GitContext } from "./context";
import { readReflog } from "./reflog";
import { resolveRevision } from "./revisions";
import { workspaceRoot } from "../filesystem/paths";

async function commit(ws: TestWorkspace, message: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await ws.files.writeFile(ws.workspaceId, path, content);
  }
  await ws.git.add(Object.keys(files));
  const result = await ws.git.commit({ message });
  expect(result.ok, result.output).toBe(true);
  return result.data?.oid ?? "";
}

/** main: A → B → C, plus feature branching from B with D. */
async function history() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  const a = await commit(ws, "A", { "app.txt": "a\n" });
  const b = await commit(ws, "B", { "app.txt": "b\n" });
  await ws.git.createAndSwitchBranch("feature");
  const d = await commit(ws, "D", { "feature.txt": "d\n" });
  await ws.git.switchBranch("main");
  const c = await commit(ws, "C", { "app.txt": "c\n" });
  const ctx: GitContext = {
    fs: ws.fs,
    dir: workspaceRoot(ws.workspaceId),
    workspaceId: ws.workspaceId,
    displayDir: "~/project",
  };
  return { ws, ctx, a, b, c, d };
}

describe("resolveRevision", () => {
  it("understands branches, HEAD, ids and ancestry suffixes", async () => {
    const { ctx, a, b, c, d } = await history();
    expect(await resolveRevision(ctx, "HEAD")).toBe(c);
    expect(await resolveRevision(ctx, "@")).toBe(c);
    expect(await resolveRevision(ctx, "main")).toBe(c);
    expect(await resolveRevision(ctx, "feature")).toBe(d);
    expect(await resolveRevision(ctx, "HEAD~1")).toBe(b);
    expect(await resolveRevision(ctx, "HEAD~2")).toBe(a);
    expect(await resolveRevision(ctx, "HEAD^^")).toBe(a);
    expect(await resolveRevision(ctx, "main^")).toBe(b);
    expect(await resolveRevision(ctx, "feature~1")).toBe(b);
    expect(await resolveRevision(ctx, "HEAD^0")).toBe(c);
    expect(await resolveRevision(ctx, a)).toBe(a);
    expect(await resolveRevision(ctx, a.slice(0, 7))).toBe(a);
  });

  it("returns null for anything that is not a commit", async () => {
    const { ctx } = await history();
    expect(await resolveRevision(ctx, "nope")).toBeNull();
    expect(await resolveRevision(ctx, "HEAD~9")).toBeNull();
    expect(await resolveRevision(ctx, "HEAD^2")).toBeNull();
    expect(await resolveRevision(ctx, "0000000")).toBeNull();
    expect(await resolveRevision(ctx, "")).toBeNull();
  });

  it("reads reflog positions", async () => {
    const { ctx, b, c } = await history();
    // HEAD@{0} is now; HEAD@{1} is before the last move (the switch back to main, at B).
    expect(await resolveRevision(ctx, "HEAD@{0}")).toBe(c);
    expect(await resolveRevision(ctx, "HEAD@{1}")).toBe(b);
    expect(await resolveRevision(ctx, "main@{1}")).toBe(b);
    expect(await resolveRevision(ctx, "HEAD@{99}")).toBeNull();
  });
});

describe("reflog", () => {
  it("records commits, branch switches and merges in Git's format", async () => {
    const { ws, ctx } = await history();
    await ws.git.merge("feature");
    const messages = (await readReflog(ctx)).map((entry) => entry.message);
    expect(messages).toEqual([
      "merge feature: Merge made by the 'ort' strategy.",
      "commit: C",
      "checkout: moving from feature to main",
      "commit: D",
      "checkout: moving from main to feature",
      "commit: B",
      "commit (initial): A",
    ]);
    const raw = await ws.fs.promises.readFile(`${ctx.dir}/.git/logs/HEAD`, { encoding: "utf8" });
    expect(raw.split("\n")[0]).toMatch(
      /^0{40} [0-9a-f]{40} GitDojo Learner <learner@gitdojo\.local> \d+ [+-]\d{4}\tcommit \(initial\): A$/,
    );
    // Each branch has its own log too.
    expect((await readReflog(ctx, "refs/heads/feature")).map((e) => e.message)).toEqual([
      "commit: D",
      "branch: Created from HEAD",
    ]);
    expect((await ws.git.snapshot()).reflog[0]).toMatchObject({
      index: 0,
      message: "merge feature: Merge made by the 'ort' strategy.",
    });
  });
});

describe("detached HEAD", () => {
  it("visits a commit with --detach and reports it everywhere", async () => {
    const { ws, b } = await history();
    const result = await ws.git.detachHead("HEAD~1");
    expect(result).toMatchObject({ ok: true, data: { branch: null, oid: b, switched: true } });
    expect(result.output).toBe(`HEAD is now at ${b.slice(0, 7)} B`);
    expect(await ws.files.readFile(ws.workspaceId, "app.txt")).toBe("b\n");

    expect((await ws.git.status()).output).toMatch(
      new RegExp(`^HEAD detached at ${b.slice(0, 7)}\n`),
    );
    expect((await ws.git.showBranches()).output).toBe(
      `* (HEAD detached at ${b.slice(0, 7)})\n  feature\n  main`,
    );
    expect((await ws.git.log({ oneline: true })).output.split("\n")[0]).toBe(
      `${b.slice(0, 7)} (HEAD) B`,
    );
    const snapshot = await ws.git.snapshot();
    expect(snapshot.currentBranch).toBeNull();
    expect(snapshot.head).toBe(b);
  });

  it("prints Git's advice when checking out a commit", async () => {
    const { ws, a } = await history();
    const result = await ws.git.detachHead(a.slice(0, 7), { advice: true });
    expect(result.output).toContain(`Note: switching to '${a.slice(0, 7)}'.`);
    expect(result.output).toContain("You are in 'detached HEAD' state.");
    expect(result.output.split("\n").at(-1)).toBe(`HEAD is now at ${a.slice(0, 7)} A`);
  });

  it("commits on a detached HEAD and warns when leaving those commits behind", async () => {
    const { ws, b } = await history();
    await ws.git.detachHead(b);
    const experiment = await commit(ws, "Experiment", { "lab.txt": "x\n" });
    expect((await ws.git.snapshot()).head).toBe(experiment);

    const back = await ws.git.switchBranch("main");
    expect(back.ok).toBe(true);
    expect(back.data?.orphaned).toEqual([experiment]);
    expect(back.output).toContain("Warning: you are leaving 1 commit behind, not connected to");
    expect(back.output).toContain(`  ${experiment.slice(0, 7)} Experiment`);
    expect(back.output).toContain(` git branch <new-branch-name> ${experiment.slice(0, 7)}`);
    expect(back.output.split("\n").at(-1)).toBe("Switched to branch 'main'");
    // The commit is gone from every branch, but the reflog still knows it.
    expect((await ws.git.snapshot()).allCommits.map((c) => c.oid)).not.toContain(experiment);
  });

  it("keeps detached commits when a branch is created there", async () => {
    const { ws, b } = await history();
    await ws.git.detachHead(b);
    const experiment = await commit(ws, "Experiment", { "lab.txt": "x\n" });
    const rescue = await ws.git.createAndSwitchBranch("rescue");
    expect(rescue.output).toBe("Switched to a new branch 'rescue'");
    expect(rescue.data?.orphaned).toEqual([]);
    expect((await ws.git.listBranches()).find((x) => x.name === "rescue")?.oid).toBe(experiment);
  });

  it("notes the previous position when nothing is lost", async () => {
    const { ws, b } = await history();
    await ws.git.detachHead(b);
    const back = await ws.git.switchBranch("main");
    expect(back.output).toBe(
      `Previous HEAD position was ${b.slice(0, 7)} B\nSwitched to branch 'main'`,
    );
  });

  it("refuses a commit without --detach, and unknown revisions", async () => {
    const { ws, a } = await history();
    const result = await ws.git.switchBranch(a.slice(0, 7));
    expect(result.error?.code).toBe("BRANCH_NOT_FOUND");
    expect(result.output).toContain("fatal: a branch is expected, got commit");
    expect(result.output).toContain("try again with the --detach option");
    expect(await ws.git.detachHead("nope")).toMatchObject({
      ok: false,
      output: "fatal: invalid reference: nope",
      error: { code: "INVALID_REVISION" },
    });
  });
});

describe("git switch -", () => {
  it("returns to the previous branch", async () => {
    const { ws } = await history();
    expect((await ws.git.switchBranch("-")).output).toBe("Switched to branch 'feature'");
    expect((await ws.git.switchBranch("-")).output).toBe("Switched to branch 'main'");
  });

  it("fails before any switch", async () => {
    const ws = await createTestWorkspace({ "a.txt": "a" });
    await ws.git.init();
    await ws.git.add(["a.txt"]);
    await ws.git.commit({ message: "A" });
    expect((await ws.git.switchBranch("-")).output).toBe("fatal: invalid reference: @{-1}");
  });
});

describe("branch start points and deletion", () => {
  it("creates branches at a start point", async () => {
    const { ws, a, b } = await history();
    expect(await ws.git.createBranch("old", "HEAD~2")).toMatchObject({
      ok: true,
      data: { oid: a },
    });
    expect(await ws.git.createBranch("bad", "nope")).toMatchObject({
      ok: false,
      output: "fatal: not a valid object name: 'nope'",
      error: { code: "INVALID_REVISION" },
    });

    const result = await ws.git.createAndSwitchBranch("hotfix", "main~1");
    expect(result).toMatchObject({
      ok: true,
      data: { branch: "hotfix", oid: b, updatedPaths: ["app.txt"] },
    });
    expect(await ws.files.readFile(ws.workspaceId, "app.txt")).toBe("b\n");
  });

  it("refuses a start point that would overwrite local changes", async () => {
    const { ws } = await history();
    await ws.files.writeFile(ws.workspaceId, "app.txt", "local\n");
    const result = await ws.git.createAndSwitchBranch("hotfix", "main~1");
    expect(result.error?.code).toBe("CHECKOUT_CONFLICT");
    expect((await ws.git.listBranches()).map((branch) => branch.name)).not.toContain("hotfix");
  });

  it("deletes merged branches, protects unmerged work and the current branch", async () => {
    const { ws, d } = await history();
    expect(await ws.git.deleteBranch("feature")).toMatchObject({
      ok: false,
      output:
        "error: the branch 'feature' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D feature'.",
      error: { code: "BRANCH_NOT_MERGED" },
    });
    expect((await ws.git.deleteBranch("main")).error?.code).toBe("BRANCH_CHECKED_OUT");
    expect((await ws.git.deleteBranch("nope")).output).toBe("error: branch 'nope' not found");

    await ws.git.merge("feature");
    expect(await ws.git.deleteBranch("feature")).toMatchObject({
      ok: true,
      output: `Deleted branch feature (was ${d.slice(0, 7)}).`,
    });
    await ws.git.createBranch("spike", "HEAD~1");
    await ws.git.switchBranch("spike");
    await commit(ws, "Spike", { "spike.txt": "s\n" });
    await ws.git.switchBranch("main");
    expect((await ws.git.deleteBranch("spike", { force: true })).ok).toBe(true);
  });
});
