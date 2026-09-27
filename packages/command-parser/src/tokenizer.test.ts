import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenizer";

function tokens(input: string): string[] {
  const result = tokenize(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.tokens;
}

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokens("  git   add  README.md ")).toEqual(["git", "add", "README.md"]);
    expect(tokens("git\tstatus")).toEqual(["git", "status"]);
  });

  it("returns no tokens for blank input", () => {
    expect(tokens("")).toEqual([]);
    expect(tokens("   ")).toEqual([]);
  });

  it("keeps double-quoted strings together", () => {
    expect(tokens('git commit -m "Initial commit"')).toEqual([
      "git",
      "commit",
      "-m",
      "Initial commit",
    ]);
  });

  it("keeps single-quoted strings literal", () => {
    expect(tokens("git commit -m 'Fix \\\"quotes\\\" $HOME'")).toEqual([
      "git",
      "commit",
      "-m",
      'Fix \\"quotes\\" $HOME',
    ]);
  });

  it("handles escaped quotes inside double quotes", () => {
    expect(tokens('git commit -m "Say \\"hi\\""')).toEqual(["git", "commit", "-m", 'Say "hi"']);
  });

  it("joins adjacent quoted and unquoted parts", () => {
    expect(tokens('-m"Initial commit"')).toEqual(["-mInitial commit"]);
    expect(tokens("a'b c'd")).toEqual(["ab cd"]);
  });

  it("keeps empty quoted strings as tokens", () => {
    expect(tokens('git commit -m ""')).toEqual(["git", "commit", "-m", ""]);
  });

  it("supports backslash-escaped spaces", () => {
    expect(tokens("git add my\\ file.txt")).toEqual(["git", "add", "my file.txt"]);
  });

  it.each(['git commit -m "Initial commit', "git commit -m 'oops", 'echo "a\\"'])(
    "rejects malformed quotes in %j",
    (input) => {
      const result = tokenize(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("MALFORMED_QUOTES");
    },
  );
});
