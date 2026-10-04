import { EMPTY_REPOSITORY_STATE, type RepositoryState } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { languageForPath, languageLabel } from "./file-language";
import { explorerFiles } from "./file-status";
import { buildFileTree, directoryPaths } from "./file-tree";

describe("buildFileTree", () => {
  it("nests files under folders, folders first, alphabetical", () => {
    const tree = buildFileTree(["src/b.ts", "README.md", "src/a.ts", "src/lib/x.ts", ".gitignore"]);
    expect(tree.map((node) => [node.type, node.path])).toEqual([
      ["directory", "src"],
      ["file", ".gitignore"],
      ["file", "README.md"],
    ]);
    const src = tree[0];
    expect(src?.children.map((node) => node.path)).toEqual(["src/lib", "src/a.ts", "src/b.ts"]);
    expect(directoryPaths(tree)).toEqual(["src", "src/lib"]);
  });

  it("ignores duplicate paths", () => {
    expect(buildFileTree(["a.txt", "a.txt"])).toHaveLength(1);
  });
});

describe("explorerFiles", () => {
  const repository = (overrides: Partial<RepositoryState>): RepositoryState => ({
    ...EMPTY_REPOSITORY_STATE,
    initialized: true,
    ...overrides,
  });

  it("maps working tree and index state to VS Code-style letters", () => {
    const files = explorerFiles(
      repository({
        files: [
          { path: "new.txt", status: "untracked" },
          { path: "edit.txt", status: "modified" },
          { path: "both.txt", status: "modified" },
          { path: "added.txt", status: "staged" },
          { path: "staged.txt", status: "staged" },
          { path: "gone.txt", status: "deleted" },
          { path: "clash.txt", status: "conflicted" },
          { path: "clean.txt", status: "committed" },
        ],
        stagedFiles: [
          { path: "both.txt", status: "staged", change: "modified" },
          { path: "added.txt", status: "staged", change: "added" },
          { path: "staged.txt", status: "staged", change: "modified" },
        ],
      }),
    );
    const letters = Object.fromEntries(
      files.map((file) => [file.path, file.indicator?.letter ?? null]),
    );
    expect(letters).toEqual({
      "new.txt": "U",
      "edit.txt": "M",
      "both.txt": "M",
      "added.txt": "A",
      "staged.txt": "M",
      "gone.txt": "D",
      "clash.txt": "C",
      "clean.txt": null,
    });
    expect(files.find((file) => file.path === "both.txt")?.indicator?.label).toBe(
      "Modified (some changes staged)",
    );
    expect(files.find((file) => file.path === "staged.txt")?.indicator?.tone).toBe("success");
    expect(files.find((file) => file.path === "gone.txt")?.exists).toBe(false);
  });
});

describe("languageForPath", () => {
  it.each([
    ["src/auth.ts", "typescript"],
    ["index.js", "javascript"],
    ["README.md", "markdown"],
    ["config/app.YAML", "yaml"],
    ["Dockerfile", "dockerfile"],
    [".gitignore", "plaintext"],
    ["notes", "plaintext"],
    ["data.unknown", "plaintext"],
  ])("%s → %s", (path, language) => {
    expect(languageForPath(path)).toBe(language);
  });

  it("labels languages for the status bar", () => {
    expect(languageLabel("typescript")).toBe("TypeScript");
    expect(languageLabel("rust")).toBe("Rust");
  });
});
