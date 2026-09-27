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
});
