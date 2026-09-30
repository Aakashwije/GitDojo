import { describe, expect, it } from "vitest";
import { type ParseErrorCode } from "./errors";
import { parseCommand } from "./parser";
import { type ParsedCommand } from "./types";

function parsed(raw: string): ParsedCommand {
  const result = parseCommand(raw);
  if (!result.ok)
    throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result.command;
}

function errorOf(raw: string): { code: ParseErrorCode; message: string } {
  const result = parseCommand(raw);
  if (result.ok) throw new Error("Expected a parse error");
  return result.error;
}

describe("parseCommand", () => {
  it("parses git init", () => {
    expect(parsed("git init")).toEqual({
      program: "git",
      command: "init",
      args: [],
      flags: {},
      raw: "git init",
    });
  });

  it("parses git status", () => {
    expect(parsed("git status")).toMatchObject({ program: "git", command: "status", args: [] });
  });

  it("parses git add with a single file", () => {
    expect(parsed("git add README.md")).toMatchObject({ command: "add", args: ["README.md"] });
  });

  it("parses git add .", () => {
    expect(parsed("git add .")).toMatchObject({ command: "add", args: ["."] });
  });

  it("parses git add with multiple paths", () => {
    expect(parsed("git add src/index.ts README.md")).toMatchObject({
      args: ["src/index.ts", "README.md"],
    });
  });

  it("parses git commit -m with a quoted message", () => {
    expect(parsed('git commit -m "Initial commit"')).toEqual({
      program: "git",
      command: "commit",
      args: [],
      flags: { m: "Initial commit" },
      raw: 'git commit -m "Initial commit"',
    });
  });

  it("accepts every common spelling of the commit message flag", () => {
    expect(parsed("git commit -m 'Single quotes'").flags).toEqual({ m: "Single quotes" });
    expect(parsed('git commit -m"Attached"').flags).toEqual({ m: "Attached" });
    expect(parsed('git commit --message "Long"').flags).toEqual({ m: "Long" });
    expect(parsed('git commit --message="Long equals"').flags).toEqual({ m: "Long equals" });
    expect(parsed("git commit -m Unquoted").flags).toEqual({ m: "Unquoted" });
  });

  it("joins repeated -m values as paragraphs", () => {
    expect(parsed('git commit -m "Title" -m "Body"').flags).toEqual({ m: "Title\n\nBody" });
  });

  it("parses git log and boolean flags", () => {
    expect(parsed("git log")).toMatchObject({ command: "log", flags: {} });
    expect(parsed("git log --oneline")).toMatchObject({ command: "log", flags: { oneline: true } });
  });

  it("parses git branch with and without a name", () => {
    expect(parsed("git branch")).toMatchObject({ command: "branch", args: [], flags: {} });
    expect(parsed("git branch feature/login")).toMatchObject({
      command: "branch",
      args: ["feature/login"],
    });
  });

  it("parses git switch and git switch -c", () => {
    expect(parsed("git switch main")).toMatchObject({ command: "switch", args: ["main"] });
    expect(parsed("git switch feature/login")).toMatchObject({ args: ["feature/login"] });
    expect(parsed("git switch -c feature/login")).toMatchObject({
      command: "switch",
      args: [],
      flags: { c: "feature/login" },
    });
    expect(parsed("git switch --create feature/login").flags).toEqual({ c: "feature/login" });
  });

  it("parses git checkout and git checkout -b", () => {
    expect(parsed("git checkout main")).toMatchObject({ command: "checkout", args: ["main"] });
    expect(parsed("git checkout -b feature/login")).toMatchObject({
      args: [],
      flags: { b: "feature/login" },
    });
  });

  it("parses git merge and its options", () => {
    expect(parsed("git merge feature/login")).toMatchObject({
      command: "merge",
      args: ["feature/login"],
      flags: {},
    });
    expect(parsed("git merge --no-ff feature/login").flags).toEqual({ "no-ff": true });
    expect(parsed("git merge --abort")).toMatchObject({ args: [], flags: { abort: true } });
  });

  it("treats everything after -- as arguments", () => {
    expect(parsed("git add -- -weird-name.txt").args).toEqual(["-weird-name.txt"]);
  });

  it("parses terminal built-ins", () => {
    expect(parsed("clear")).toMatchObject({ program: "clear", args: [] });
    expect(parsed("help")).toMatchObject({ program: "help" });
  });

  describe("errors", () => {
    it("rejects empty input", () => {
      expect(errorOf("").code).toBe("EMPTY_COMMAND");
      expect(errorOf("   ").code).toBe("EMPTY_COMMAND");
    });

    it("rejects unsupported programs without executing anything", () => {
      expect(errorOf("ls -la")).toMatchObject({ code: "UNSUPPORTED_PROGRAM" });
      expect(errorOf("rm -rf /").message).toMatch(/^rm: command not found/);
    });

    it("shows usage for bare git", () => {
      const error = errorOf("git");
      expect(error.code).toBe("MISSING_GIT_COMMAND");
      expect(error.message).toContain("usage: git <command>");
    });

    it("rejects unknown git commands with Git's wording", () => {
      expect(errorOf("git xyz")).toEqual({
        code: "UNSUPPORTED_GIT_COMMAND",
        message: "git: 'xyz' is not a git command.",
      });
    });

    it("explains that real but unsupported git commands are coming", () => {
      expect(errorOf("git rebase main").message).toBe(
        "git: 'rebase' is not available in GitDojo yet.",
      );
    });

    it("limits the number of arguments", () => {
      expect(errorOf("git branch a b")).toEqual({
        code: "UNEXPECTED_ARGUMENT",
        message: "error: unexpected argument 'b'\nusage: git branch [<name>]",
      });
      expect(errorOf("git switch a b").code).toBe("UNEXPECTED_ARGUMENT");
    });

    it("requires a branch name after -c", () => {
      expect(errorOf("git switch -c")).toEqual({
        code: "MISSING_FLAG_VALUE",
        message: "error: switch 'c' requires a value",
      });
    });

    it("leaves the commit message check to the engine", () => {
      // A merge in progress can be concluded with a plain `git commit`.
      expect(parsed("git commit")).toMatchObject({ command: "commit", flags: {} });
    });

    it("requires a value for -m", () => {
      expect(errorOf("git commit -m").code).toBe("MISSING_FLAG_VALUE");
    });

    it("rejects unknown flags", () => {
      expect(errorOf("git commit -am 'x'").code).toBe("UNKNOWN_FLAG");
      expect(errorOf("git status --porcelain").message).toContain("unknown option '--porcelain'");
    });

    it("rejects values on boolean flags", () => {
      expect(errorOf("git log --oneline=yes").code).toBe("UNKNOWN_FLAG");
    });

    it("rejects unexpected arguments", () => {
      expect(errorOf("git init my-repo").code).toBe("UNEXPECTED_ARGUMENT");
    });

    it("reports malformed quotes", () => {
      expect(errorOf('git commit -m "Initial commit').code).toBe("MALFORMED_QUOTES");
    });
  });
});
