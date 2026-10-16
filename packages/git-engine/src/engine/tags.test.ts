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

async function repo() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  const a = await commit(ws, "Initial commit", { "README.md": "# App\n" });
  const b = await commit(ws, "Add login", { "login.js": "export {};\n" });
  return { ws, a, b };
}

describe("git tag", () => {
  it("lists nothing in a repository without tags", async () => {
    const { ws } = await repo();
    expect(await ws.git.listTags()).toMatchObject({ ok: true, output: "", data: { tags: [] } });
  });

  it("creates a lightweight tag at HEAD silently", async () => {
    const { ws, b } = await repo();
    const created = await ws.git.createTag("v1.0");
    expect(created).toMatchObject({ ok: true, output: "" });
    expect((await ws.git.snapshot()).tags).toEqual([{ name: "v1.0", oid: b, annotated: false }]);
    expect((await ws.git.listTags()).output).toBe("v1.0");
  });

  it("tags an older commit by revision", async () => {
    const { ws, a } = await repo();
    await ws.git.createTag("v0.1", { target: "HEAD~1" });
    expect((await ws.git.snapshot()).tags[0]).toMatchObject({ name: "v0.1", oid: a });
  });

  it("creates annotated tags with a message, peeled to their commit", async () => {
    const { ws, b } = await repo();
    const created = await ws.git.createTag("v1.0", { annotated: true, message: "First release" });
    expect(created.ok, created.output).toBe(true);
    expect((await ws.git.snapshot()).tags).toEqual([
      { name: "v1.0", oid: b, annotated: true, message: "First release" },
    ]);
    // A message alone makes an annotated tag too, as in Git.
    await ws.git.createTag("v1.0.1", { message: "Patch" });
    expect((await ws.git.snapshot()).tags.map((tag) => tag.annotated)).toEqual([true, true]);
  });

  it("refuses an annotated tag without a message", async () => {
    const { ws } = await repo();
    const result = await ws.git.createTag("v1.0", { annotated: true });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENT");
    expect((await ws.git.snapshot()).tags).toEqual([]);
  });

  it("refuses duplicates, invalid names and unknown commits", async () => {
    const { ws } = await repo();
    await ws.git.createTag("v1.0");
    expect(await ws.git.createTag("v1.0")).toMatchObject({
      ok: false,
      output: "fatal: tag 'v1.0' already exists",
      error: { code: "TAG_EXISTS" },
    });
    expect((await ws.git.createTag("bad..name")).error?.code).toBe("INVALID_TAG_NAME");
    expect((await ws.git.createTag("v2", { target: "nope" })).error?.code).toBe("INVALID_REVISION");
  });

  it("refuses to tag before the first commit", async () => {
    const ws = await createTestWorkspace();
    await ws.git.init();
    expect((await ws.git.createTag("v1")).error?.code).toBe("NO_COMMITS");
  });

  it("lists by pattern and with annotations", async () => {
    const { ws } = await repo();
    await ws.git.createTag("v1.0", { message: "First release" });
    await ws.git.createTag("v2.0");
    await ws.git.createTag("nightly");
    expect((await ws.git.listTags({ pattern: "v*" })).output).toBe("v1.0\nv2.0");
    const annotated = (await ws.git.listTags({ annotations: true })).output.split("\n");
    expect(annotated).toEqual([
      expect.stringMatching(/^nightly\s+Add login$/),
      expect.stringMatching(/^v1\.0\s+First release$/),
      expect.stringMatching(/^v2\.0\s+Add login$/),
    ]);
  });

  it("deletes tags and reports unknown ones", async () => {
    const { ws } = await repo();
    await ws.git.createTag("v1.0");
    const deleted = await ws.git.deleteTag("v1.0");
    expect(deleted.output).toMatch(/^Deleted tag 'v1\.0' \(was [0-9a-f]{7}\)$/);
    expect((await ws.git.snapshot()).tags).toEqual([]);
    expect(await ws.git.deleteTag("v1.0")).toMatchObject({
      ok: false,
      output: "error: tag 'v1.0' not found.",
      error: { code: "TAG_NOT_FOUND" },
    });
  });

  it("names commits anywhere a revision is accepted, and decorates the log", async () => {
    const { ws, a } = await repo();
    await ws.git.createTag("v0.1", { target: "HEAD~1", message: "Preview" });
    const log = await ws.git.log({ oneline: true });
    expect(log.output.split("\n")[1]).toMatch(/^[0-9a-f]{7} \(tag: v0\.1\) Initial commit$/);
    const detached = await ws.git.detachHead("v0.1");
    expect(detached.ok, detached.output).toBe(true);
    expect((await ws.git.snapshot()).head).toBe(a);
    // `git switch` wants a branch, and says what it got instead.
    expect((await ws.git.switchBranch("v0.1")).output).toMatch(
      /^fatal: a branch is expected, got tag 'v0\.1'/,
    );
  });

  it("keeps a tagged commit in the graph after its branch moves away", async () => {
    const { ws, b } = await repo();
    await ws.git.createTag("v1.0");
    await ws.git.reset({ mode: "hard", commit: "HEAD~1" });
    const snapshot = await ws.git.snapshot();
    expect(snapshot.commits.map((commit) => commit.oid)).not.toContain(b);
    expect(snapshot.allCommits.map((commit) => commit.oid)).toContain(b);
  });
});
