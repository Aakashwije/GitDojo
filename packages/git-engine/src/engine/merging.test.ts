import { describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";

const AUTH = [
  "export const provider = 'password';",
  "// Session settings",
  "export const timeout = 30;",
  "",
].join("\n");

/** Commits `files` on the current branch. */
async function commit(ws: TestWorkspace, message: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await ws.files.writeFile(ws.workspaceId, path, content);
  }
  await ws.git.add(Object.keys(files));
  const result = await ws.git.commit({ message });
  expect(result.ok, result.output).toBe(true);
  return result.data?.oid ?? "";
}

/** main: Initial commit → feature/login branches off with its own commit(s). */
async function setup(): Promise<TestWorkspace> {
  const ws = await createTestWorkspace();
  await ws.git.init();
  await commit(ws, "Initial commit", { "README.md": "# App\n", "src/auth.ts": AUTH });
  await ws.git.createAndSwitchBranch("feature/login");
  await commit(ws, "Add login form", { "login.js": "login();\n" });
  await ws.git.switchBranch("main");
  return ws;
}

describe("merge", () => {
  it("rejects missing, unknown and invalid branch names", async () => {
    const ws = await setup();
    expect(await ws.git.merge("")).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGUMENT" },
    });
    expect(await ws.git.merge("nope")).toMatchObject({
      ok: false,
      output: "merge: nope - not something we can merge",
      error: { code: "BRANCH_NOT_FOUND" },
    });
    expect((await ws.git.merge("bad..name")).error?.code).toBe("BRANCH_NOT_FOUND");
  });

  it("fails outside a repository", async () => {
    const { git } = await createTestWorkspace();
    expect((await git.merge("main")).error?.code).toBe("NOT_A_REPOSITORY");
  });

  it("fast-forwards when the current branch has no commits of its own", async () => {
    const ws = await setup();
    const feature = (await ws.git.listBranches()).find((b) => b.name === "feature/login")?.oid;
    const result = await ws.git.merge("feature/login");
    expect(result).toMatchObject({ ok: true, data: { type: "fast-forward", oid: feature } });
    expect(result.output).toMatch(/^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}\nFast-forward\n/);
    expect(result.output).toContain(" login.js | 1 +\n 1 file changed, 1 insertion(+)");
    expect(result.output).toContain(" create mode 100644 login.js");

    const snapshot = await ws.git.snapshot();
    expect(snapshot.head).toBe(feature);
    expect(snapshot.branches.find((b) => b.name === "main")?.oid).toBe(feature);
    expect(await ws.files.readFile(ws.workspaceId, "login.js")).toBe("login();\n");
    expect((await ws.git.status()).output).toContain("nothing to commit, working tree clean");
  });

  it("reports when there is nothing to merge", async () => {
    const ws = await setup();
    await ws.git.merge("feature/login");
    expect(await ws.git.merge("feature/login")).toMatchObject({
      ok: true,
      output: "Already up to date.",
      data: { type: "up-to-date" },
    });
    await ws.git.switchBranch("feature/login");
    expect((await ws.git.merge("main")).data?.type).toBe("up-to-date");
  });

  it("creates a merge commit with --no-ff", async () => {
    const ws = await setup();
    const result = await ws.git.merge("feature/login", { noFastForward: true });
    expect(result.data?.type).toBe("merge-commit");
    const [merge] = (await ws.git.snapshot()).commits;
    expect(merge?.parents).toHaveLength(2);
    expect(merge?.message).toBe("Merge branch 'feature/login'");
  });

  it("three-way merges diverged branches into a merge commit", async () => {
    const ws = await setup();
    const mainTip = await commit(ws, "Update README", { "README.md": "# App\n\nNow on main.\n" });
    const result = await ws.git.merge("feature/login");
    expect(result.output).toBe(
      [
        "Merge made by the 'ort' strategy.",
        " login.js | 1 +",
        " 1 file changed, 1 insertion(+)",
        " create mode 100644 login.js",
      ].join("\n"),
    );
    expect(result.data?.type).toBe("merge-commit");

    const snapshot = await ws.git.snapshot();
    const [merge] = snapshot.commits;
    const feature = snapshot.branches.find((b) => b.name === "feature/login")?.oid;
    expect(merge?.parents).toEqual([mainTip, feature]);
    expect(snapshot.head).toBe(result.data?.oid);
    expect(await ws.files.readFile(ws.workspaceId, "login.js")).toBe("login();\n");
    expect(await ws.files.readFile(ws.workspaceId, "README.md")).toContain("Now on main.");
    expect((await ws.git.status()).output).toContain("working tree clean");
    expect((await ws.git.log()).output).toMatch(/^commit [0-9a-f]{40} \(HEAD -> main\)\nMerge: /);
  });

  // Like Git, edits must be separated by at least one unchanged line to merge cleanly.
  it("auto-merges edits to different parts of the same file", async () => {
    const ws = await setup();
    await ws.git.switchBranch("feature/login");
    await commit(ws, "Use OAuth", { "src/auth.ts": AUTH.replace("'password'", "'oauth'") });
    await ws.git.switchBranch("main");
    await commit(ws, "Longer timeout", { "src/auth.ts": AUTH.replace("30", "60") });
    const result = await ws.git.merge("feature/login");
    expect(result.output).toMatch(/^Auto-merging src\/auth\.ts\nMerge made by/);
    expect(await ws.files.readFile(ws.workspaceId, "src/auth.ts")).toBe(
      "export const provider = 'oauth';\n// Session settings\nexport const timeout = 60;\n",
    );
  });

  it("refuses to overwrite uncommitted work", async () => {
    const ws = await setup();
    await ws.files.writeFile(ws.workspaceId, "login.js", "untracked\n");
    const result = await ws.git.merge("feature/login");
    expect(result.error?.code).toBe("CHECKOUT_CONFLICT");
    expect(result.output).toContain("untracked working tree files would be overwritten by merge");
    expect(await ws.files.readFile(ws.workspaceId, "login.js")).toBe("untracked\n");
  });
});

describe("merge conflicts", () => {
  /** Both branches change the timeout line of src/auth.ts. */
  async function conflicted(): Promise<TestWorkspace> {
    const ws = await setup();
    await ws.git.switchBranch("feature/login");
    await commit(ws, "Timeout 60", { "src/auth.ts": AUTH.replace("30", "60") });
    await ws.git.switchBranch("main");
    await commit(ws, "Timeout 45", { "src/auth.ts": AUTH.replace("30", "45") });
    return ws;
  }

  const CONFLICTED = [
    "export const provider = 'password';",
    "// Session settings",
    "<<<<<<< HEAD",
    "export const timeout = 45;",
    "=======",
    "export const timeout = 60;",
    ">>>>>>> feature/login",
    "",
  ].join("\n");

  it("stops with conflict markers and leaves the merge in progress", async () => {
    const ws = await conflicted();
    const head = (await ws.git.snapshot()).head;
    const result = await ws.git.merge("feature/login");
    expect(result).toMatchObject({
      ok: false,
      data: { type: "conflict", conflicts: ["src/auth.ts"] },
      error: { code: "MERGE_CONFLICT" },
    });
    expect(result.output).toBe(
      [
        "Auto-merging src/auth.ts",
        "CONFLICT (content): Merge conflict in src/auth.ts",
        "Automatic merge failed; fix conflicts and then commit the result.",
      ].join("\n"),
    );
    expect(await ws.files.readFile(ws.workspaceId, "src/auth.ts")).toBe(CONFLICTED);
    // Clean changes from the other branch are staged; HEAD does not move yet.
    expect(await ws.files.readFile(ws.workspaceId, "login.js")).toBe("login();\n");

    const snapshot = await ws.git.snapshot();
    expect(snapshot.head).toBe(head);
    expect(snapshot.merge).toEqual({
      branch: "feature/login",
      theirs: snapshot.branches.find((b) => b.name === "feature/login")?.oid,
      conflicts: [
        {
          path: "src/auth.ts",
          base: AUTH,
          ours: AUTH.replace("30", "45"),
          theirs: AUTH.replace("30", "60"),
          resolved: false,
        },
      ],
    });

    expect((await ws.git.status()).output).toBe(
      [
        "On branch main",
        "You have unmerged paths.",
        '  (fix conflicts and run "git commit")',
        '  (use "git merge --abort" to abort the merge)',
        "",
        "Changes to be committed:",
        '  (use "git restore --staged <file>..." to unstage)',
        "\tnew file:   login.js",
        "",
        "Unmerged paths:",
        '  (use "git add <file>..." to mark resolution)',
        "\tboth modified:   src/auth.ts",
      ].join("\n"),
    );
  });

  it("blocks committing, switching and merging until conflicts are resolved", async () => {
    const ws = await conflicted();
    await ws.git.merge("feature/login");
    expect((await ws.git.commit({ message: "x" })).output).toMatch(
      /^error: Committing is not possible because you have unmerged files\./,
    );
    expect((await ws.git.switchBranch("feature/login")).error?.code).toBe("MERGE_IN_PROGRESS");
    expect((await ws.git.merge("feature/login")).error?.code).toBe("MERGE_IN_PROGRESS");
  });

  it("does not accept a file that still has markers", async () => {
    const ws = await conflicted();
    await ws.git.merge("feature/login");
    const add = await ws.git.add(["src/auth.ts"]);
    expect(add.ok).toBe(true);
    expect(add.output).toContain("still contains conflict markers");
    expect((await ws.git.snapshot()).merge?.conflicts[0]?.resolved).toBe(false);
  });

  it("concludes the merge after the file is edited, staged and committed", async () => {
    const ws = await conflicted();
    await ws.git.merge("feature/login");
    await ws.files.writeFile(ws.workspaceId, "src/auth.ts", AUTH.replace("30", "60"));

    const add = await ws.git.add(["src/auth.ts"]);
    expect(add).toMatchObject({ ok: true, output: "", data: { resolved: ["src/auth.ts"] } });
    expect((await ws.git.status()).output).toMatch(
      /^On branch main\nAll conflicts fixed but you are still merging\./,
    );

    // A plain `git commit` uses the prepared merge message.
    const commitResult = await ws.git.commit({ message: "" });
    expect(commitResult.output).toMatch(/^\[main [0-9a-f]{7}\] Merge branch 'feature\/login'$/);
    const snapshot = await ws.git.snapshot();
    expect(snapshot.merge).toBeNull();
    expect(snapshot.commits[0]?.parents).toHaveLength(2);
    expect((await ws.git.status()).output).toContain("nothing to commit, working tree clean");
  });

  it("accepts a resolution identical to the current version", async () => {
    const ws = await conflicted();
    await ws.git.merge("feature/login");
    await ws.files.writeFile(ws.workspaceId, "src/auth.ts", AUTH.replace("30", "45"));
    expect((await ws.git.add(["."])).data?.resolved).toEqual(["src/auth.ts"]);
    expect((await ws.git.commit({ message: "Merge feature/login" })).ok).toBe(true);
  });

  it("aborts back to the state before the merge", async () => {
    const ws = await conflicted();
    const before = await ws.git.snapshot();
    await ws.git.merge("feature/login");
    expect(await ws.git.abortMerge()).toMatchObject({ ok: true, output: "" });
    expect(await ws.git.snapshot()).toEqual(before);
    expect(await ws.files.readFile(ws.workspaceId, "src/auth.ts")).toBe(AUTH.replace("30", "45"));
    expect(await ws.files.exists(ws.workspaceId, "login.js")).toBe(false);
    expect((await ws.git.abortMerge()).error?.code).toBe("NO_MERGE");
  });

  it("reports modify/delete conflicts and keeps the modified version", async () => {
    const ws = await setup();
    await ws.git.switchBranch("feature/login");
    await ws.files.removeFile(ws.workspaceId, "README.md");
    await ws.git.add(["README.md"]);
    await ws.git.commit({ message: "Remove README" });
    await ws.git.switchBranch("main");
    await commit(ws, "Edit README", { "README.md": "# App v2\n" });

    const result = await ws.git.merge("feature/login");
    expect(result.output).toContain(
      "CONFLICT (modify/delete): README.md deleted in feature/login and modified in HEAD.",
    );
    expect(await ws.files.readFile(ws.workspaceId, "README.md")).toBe("# App v2\n");
    expect((await ws.git.status()).output).toContain("\tdeleted by them: README.md");
  });
});
