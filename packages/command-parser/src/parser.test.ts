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
      expect(errorOf("git branch feature").message).toBe(
        "git: 'branch' is not available in GitDojo yet.",
      );
    });

    it("requires a commit message", () => {
      expect(errorOf("git commit")).toEqual({
        code: "MISSING_REQUIRED_FLAG",
        message: "error: commit message is required",
      });
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
