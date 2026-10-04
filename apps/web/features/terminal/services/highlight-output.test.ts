import { describe, expect, it } from "vitest";
import { ansi } from "./ansi";
import { highlightOutput } from "./highlight-output";

describe("highlightOutput", () => {
  it("colors errors red", () => {
    expect(highlightOutput("fatal: not a git repository", false)).toBe(
      ansi.error("fatal: not a git repository"),
    );
  });

  it("colors staged entries green and untracked entries red", () => {
    const output = [
      "Changes to be committed:",
      '  (use "git rm --cached <file>..." to unstage)',
      "\tnew file:   a.txt",
      "",
      "Untracked files:",
      "\tb.txt",
    ].join("\n");
    const lines = highlightOutput(output, true).split("\n");
    expect(lines[2]).toBe(ansi.success("\tnew file:   a.txt"));
    expect(lines[5]).toBe(ansi.error("\tb.txt"));
    expect(lines[0]).toBe("Changes to be committed:");
  });

  it("highlights commit hashes and decorations in git log", () => {
    const oid = "a".repeat(40);
    const highlighted = highlightOutput(`commit ${oid} (HEAD -> main)`, true);
    expect(highlighted).toContain(ansi.warning(`commit ${oid}`));
    expect(highlighted).toContain(ansi.branch(ansi.bold("main")));
  });

  it("never changes the visible text", () => {
    const output = "On branch main\nnothing to commit, working tree clean";
    // eslint-disable-next-line no-control-regex
    const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
    expect(strip(highlightOutput(output, true))).toBe(output);
  });

  it("colors merge conflicts and diffstats", () => {
    const output = [
      "Auto-merging src/auth.ts",
      "CONFLICT (content): Merge conflict in src/auth.ts",
      "Automatic merge failed; fix conflicts and then commit the result.",
    ].join("\n");
    const lines = highlightOutput(output, false).split("\n");
    expect(lines[0]).toBe("Auto-merging src/auth.ts");
    expect(lines[1]).toContain("\x1b[");
    expect(highlightOutput(" login.js | 3 ++-", true)).toContain("\x1b[");
  });

  it("colors unified diffs", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1234567..89abcde 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,2 +1,2 @@ header",
      " same",
      "-old",
      "+new",
      "\\ No newline at end of file",
    ].join("\n");
    const lines = highlightOutput(diff, true).split("\n");
    expect(lines[0]).toBe(ansi.bold("diff --git a/a.txt b/a.txt"));
    expect(lines[3]).toBe(ansi.bold("+++ b/a.txt"));
    expect(lines[4]).toBe(`${ansi.path("@@ -1,2 +1,2 @@")} header`);
    expect(lines[5]).toBe(" same");
    expect(lines[6]).toBe(ansi.error("-old"));
    expect(lines[7]).toBe(ansi.success("+new"));
    expect(lines[8]).toBe(ansi.muted("\\ No newline at end of file"));
  });

  it("colors reflog and stash lines", () => {
    expect(highlightOutput("abc1234 (HEAD -> main) HEAD@{0}: commit: Add login", true)).toBe(
      `${ansi.warning("abc1234")} ${ansi.warning("(")}${ansi.accent(ansi.bold("HEAD ->"))} ${ansi.branch(ansi.bold("main"))}${ansi.warning(")")} ${ansi.accent("HEAD@{0}")}: commit: Add login`,
    );
    expect(highlightOutput("stash@{1}: WIP on main: abc1234 Base", true)).toBe(
      `${ansi.accent("stash@{1}")}: WIP on main: abc1234 Base`,
    );
    expect(highlightOutput("HEAD is now at abc1234 Base", true)).toBe(
      ansi.success("HEAD is now at abc1234 Base"),
    );
  });
});
