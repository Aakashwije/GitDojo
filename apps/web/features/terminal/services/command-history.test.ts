import { describe, expect, it } from "vitest";
import { appendEntry, INITIAL_HISTORY_CURSOR, nextEntry, previousEntry } from "./command-history";

const entries = ["git init", "git status", "git add ."];

describe("command history", () => {
  it("walks backwards and forwards, restoring the draft", () => {
    const first = previousEntry(entries, INITIAL_HISTORY_CURSOR, "git com");
    expect(first?.line).toBe("git add .");
    const second = previousEntry(entries, first?.cursor ?? INITIAL_HISTORY_CURSOR, "");
    expect(second?.line).toBe("git status");
    const forward = nextEntry(entries, second?.cursor ?? INITIAL_HISTORY_CURSOR);
    expect(forward?.line).toBe("git add .");
    const draft = nextEntry(entries, forward?.cursor ?? INITIAL_HISTORY_CURSOR);
    expect(draft).toEqual({ cursor: INITIAL_HISTORY_CURSOR, line: "git com" });
  });

  it("stops at the oldest entry", () => {
    const cursor = { index: 0, draft: "" };
    expect(previousEntry(entries, cursor, "")).toBeNull();
  });

  it("does nothing without history", () => {
    expect(previousEntry([], INITIAL_HISTORY_CURSOR, "")).toBeNull();
    expect(nextEntry(entries, INITIAL_HISTORY_CURSOR)).toBeNull();
  });

  it("skips blanks and consecutive duplicates", () => {
    expect(appendEntry(["git init"], "  ")).toEqual(["git init"]);
    expect(appendEntry(["git init"], "git init")).toEqual(["git init"]);
    expect(appendEntry(["git init"], " git status ")).toEqual(["git init", "git status"]);
    expect(appendEntry(["a", "b"], "c", 2)).toEqual(["b", "c"]);
  });
});
