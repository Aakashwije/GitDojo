import { describe, expect, it } from "vitest";
import { classifyStatusRow, type StatusRow } from "./status-matrix";

describe("classifyStatusRow", () => {
  it.each<[string, StatusRow, string | null, string | null]>([
    ["untracked", ["a", 0, 2, 0], null, "untracked"],
    ["new, staged", ["a", 0, 2, 2], "added", null],
    ["new, staged, then modified", ["a", 0, 2, 3], "added", "modified"],
    ["unmodified", ["a", 1, 1, 1], null, null],
    ["modified, unstaged", ["a", 1, 2, 1], null, "modified"],
    ["modified, staged", ["a", 1, 2, 2], "modified", null],
    ["modified, staged, modified again", ["a", 1, 2, 3], "modified", "modified"],
    ["deleted, unstaged", ["a", 1, 0, 1], null, "deleted"],
    ["deleted, staged", ["a", 1, 0, 0], "deleted", null],
    ["removed from index but kept on disk", ["a", 1, 1, 0], "deleted", "untracked"],
    ["new, staged, then deleted", ["a", 0, 0, 3], "added", "deleted"],
  ])("%s", (_name, row, staged, unstaged) => {
    const entry = classifyStatusRow(row);
    expect(entry.staged).toBe(staged);
    expect(entry.unstaged).toBe(unstaged);
  });
});
