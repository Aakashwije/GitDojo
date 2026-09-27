import { beforeEach, describe, expect, it } from "vitest";
import { createTestFs } from "../test-utils/create-test-fs";
import { normalizeWorkspacePath, resolveWorkspacePath, UnsafePathError } from "./paths";
import { FileNotFoundError, WorkspaceFileSystem } from "./workspace-file-system";

const WS = "lesson-1";

describe("normalizeWorkspacePath", () => {
  it.each([
    ["README.md", "README.md"],
    ["./README.md", "README.md"],
    ["/README.md", "README.md"],
    ["src//index.ts", "src/index.ts"],
    ["src/./index.ts", "src/index.ts"],
    ["src/", "src"],
    [".", ""],
    ["", ""],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeWorkspacePath(input)).toBe(expected);
  });

  it.each(["../secret", "../../etc/passwd", "src/../../x", "a/..", "..", "a\\b", "a\0b"])(
    "rejects unsafe path %j",
    (input) => {
      expect(() => normalizeWorkspacePath(input)).toThrow(UnsafePathError);
    },
  );

  it("resolves inside the workspace root", () => {
    expect(resolveWorkspacePath(WS, "/src/index.ts")).toBe("/gitdojo/lesson-1/src/index.ts");
    expect(resolveWorkspacePath(WS, "")).toBe("/gitdojo/lesson-1");
  });

  it("rejects invalid workspace ids", () => {
    expect(() => resolveWorkspacePath("../other", "a")).toThrow();
    expect(() => resolveWorkspacePath("a/b", "a")).toThrow();
  });
});

describe("WorkspaceFileSystem", () => {
  let vfs: WorkspaceFileSystem;

  beforeEach(async () => {
    vfs = new WorkspaceFileSystem(createTestFs());
    await vfs.createWorkspace(WS);
  });

  it("creates and reads a file", async () => {
    await vfs.writeFile(WS, "README.md", "# Hello");
    expect(await vfs.readFile(WS, "README.md")).toBe("# Hello");
    expect(await vfs.exists(WS, "README.md")).toBe(true);
  });

  it("creates parent directories when writing nested files", async () => {
    await vfs.writeFile(WS, "src/lib/util.ts", "export {};");
    expect(await vfs.readFile(WS, "src/lib/util.ts")).toBe("export {};");
  });

  it("updates an existing file", async () => {
    await vfs.writeFile(WS, "README.md", "v1");
    await vfs.writeFile(WS, "README.md", "v2");
    expect(await vfs.readFile(WS, "README.md")).toBe("v2");
  });

  it("removes a file", async () => {
    await vfs.writeFile(WS, "README.md", "x");
    await vfs.removeFile(WS, "README.md");
    expect(await vfs.exists(WS, "README.md")).toBe(false);
  });

  it("reports missing files with a typed error", async () => {
    await expect(vfs.readFile(WS, "missing.md")).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(vfs.removeFile(WS, "missing.md")).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("creates directories", async () => {
    await vfs.createDirectory(WS, "src/components");
    expect(await vfs.exists(WS, "src/components")).toBe(true);
    const entries = await vfs.listFiles(WS);
    expect(entries).toEqual([
      { path: "src", name: "src", type: "directory" },
      { path: "src/components", name: "components", type: "directory" },
    ]);
  });

  it("lists files recursively and sorted, scoped to a sub path", async () => {
    await vfs.writeFile(WS, "b.txt", "");
    await vfs.writeFile(WS, "a/c.txt", "");
    expect((await vfs.listFiles(WS)).map((entry) => entry.path)).toEqual(["a", "a/c.txt", "b.txt"]);
    expect((await vfs.listFiles(WS, "a")).map((entry) => entry.path)).toEqual(["a/c.txt"]);
  });

  it("resets a workspace to empty", async () => {
    await vfs.writeFile(WS, "README.md", "x");
    await vfs.writeFile(WS, "src/index.ts", "x");
    await vfs.resetWorkspace(WS);
    expect(await vfs.listFiles(WS)).toEqual([]);
  });

  it("isolates workspaces from each other", async () => {
    await vfs.createWorkspace("lesson-2");
    await vfs.writeFile(WS, "README.md", "one");
    await vfs.writeFile("lesson-2", "README.md", "two");
    await vfs.resetWorkspace("lesson-2");
    expect(await vfs.readFile(WS, "README.md")).toBe("one");
    expect(await vfs.exists("lesson-2", "README.md")).toBe(false);
  });

  it("prevents traversal outside the workspace for every operation", async () => {
    await vfs.createWorkspace("victim");
    await vfs.writeFile("victim", "secret.txt", "s");
    const unsafe = "../victim/secret.txt";
    await expect(vfs.readFile(WS, unsafe)).rejects.toBeInstanceOf(UnsafePathError);
    await expect(vfs.writeFile(WS, unsafe, "x")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(vfs.removeFile(WS, unsafe)).rejects.toBeInstanceOf(UnsafePathError);
    await expect(vfs.exists(WS, unsafe)).rejects.toBeInstanceOf(UnsafePathError);
    await expect(vfs.createDirectory(WS, "../escape")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(vfs.listFiles(WS, "..")).rejects.toBeInstanceOf(UnsafePathError);
    expect(await vfs.readFile("victim", "secret.txt")).toBe("s");
  });

  it("refuses to modify Git internals or the workspace root", async () => {
    await expect(vfs.writeFile(WS, ".git/HEAD", "x")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(vfs.removeFile(WS, "/")).rejects.toBeInstanceOf(UnsafePathError);
  });
});
