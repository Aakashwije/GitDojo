import { describe, expect, it } from "vitest";
import { EMPTY_LINE, interpretInput, type LineState } from "./line-editor";

const at = (buffer: string, cursor = buffer.length): LineState => ({ buffer, cursor });

describe("interpretInput", () => {
  it("inserts printable characters at the cursor", () => {
    expect(interpretInput(EMPTY_LINE, "g")).toEqual({ type: "edit", state: at("g") });
    expect(interpretInput(at("gt", 1), "i")).toEqual({ type: "edit", state: at("git", 2) });
  });

  it("submits on Enter", () => {
    expect(interpretInput(at("git init"), "\r")).toEqual({ type: "submit", line: "git init" });
  });

  it("handles backspace and delete", () => {
    expect(interpretInput(at("git"), "\x7f")).toEqual({ type: "edit", state: at("gi") });
    expect(interpretInput(at("git", 0), "\x7f")).toEqual({ type: "ignore" });
    expect(interpretInput(at("git", 0), "\x1b[3~")).toEqual({ type: "edit", state: at("it", 0) });
  });

  it("moves the cursor", () => {
    expect(interpretInput(at("git"), "\x1b[D")).toEqual({ type: "edit", state: at("git", 2) });
    expect(interpretInput(at("git", 2), "\x1b[C")).toEqual({ type: "edit", state: at("git", 3) });
    expect(interpretInput(at("git"), "\x1b[H")).toEqual({ type: "edit", state: at("git", 0) });
    expect(interpretInput(at("git", 0), "\x05")).toEqual({ type: "edit", state: at("git", 3) });
  });

  it("maps arrows to history and control keys to actions", () => {
    expect(interpretInput(EMPTY_LINE, "\x1b[A")).toEqual({
      type: "history",
      direction: "previous",
    });
    expect(interpretInput(EMPTY_LINE, "\x1b[B")).toEqual({ type: "history", direction: "next" });
    expect(interpretInput(EMPTY_LINE, "\x03")).toEqual({ type: "interrupt" });
    expect(interpretInput(EMPTY_LINE, "\x0c")).toEqual({ type: "clear-screen" });
  });

  it("ignores unknown escape sequences and strips control characters from pastes", () => {
    expect(interpretInput(EMPTY_LINE, "\x1b[15~")).toEqual({ type: "ignore" });
    expect(interpretInput(EMPTY_LINE, "git\x07 status")).toEqual({
      type: "edit",
      state: at("git status"),
    });
  });

  it("submits a pasted line that ends with a newline", () => {
    expect(interpretInput(EMPTY_LINE, "git status\n")).toEqual({
      type: "submit",
      line: "git status",
    });
  });
});
