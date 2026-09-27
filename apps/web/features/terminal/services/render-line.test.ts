import { describe, expect, it } from "vitest";
import { PLAIN_PROMPT } from "./ansi";
import { renderInputLine, rowOffset } from "./render-line";

describe("rowOffset", () => {
  it("accounts for xterm's pending-wrap state at the end of a full row", () => {
    expect(rowOffset(0, 10)).toBe(0);
    expect(rowOffset(5, 10)).toBe(0);
    expect(rowOffset(10, 10)).toBe(0);
    expect(rowOffset(11, 10)).toBe(1);
    expect(rowOffset(25, 10)).toBe(2);
  });
});

describe("renderInputLine", () => {
  it("moves up over wrapped rows before redrawing", () => {
    const rendered = renderInputLine(25, { buffer: "git", cursor: 3 }, 10);
    expect(rendered.data.startsWith("\x1b[2A\r\x1b[J")).toBe(true);
    expect(rendered.cursorOffset).toBe(PLAIN_PROMPT.length + 3);
  });

  it("saves and restores the cursor when editing mid-line", () => {
    const rendered = renderInputLine(0, { buffer: "gitt", cursor: 2 }, 80);
    expect(rendered.data).toContain("\x1b7");
    expect(rendered.data.endsWith("\x1b8")).toBe(true);
  });
});
