import { describe, expect, it } from "vitest";
import { classifyConflictLines, countConflictBlocks, hasMarkerLines } from "./conflict-lines";

const FILE = ["a", "<<<<<<< HEAD", "mine", "=======", "theirs", ">>>>>>> feature/login", "b"].join(
  "\n",
);

describe("conflict lines", () => {
  it("tags marker lines and the regions between them", () => {
    expect(classifyConflictLines(FILE).map((line) => line.kind)).toEqual([
      "plain",
      "ours-marker",
      "ours",
      "separator",
      "theirs",
      "theirs-marker",
      "plain",
    ]);
  });

  it("counts blocks and notices stray markers", () => {
    expect(countConflictBlocks(FILE)).toBe(1);
    expect(countConflictBlocks("a\nb")).toBe(0);
    expect(hasMarkerLines("a\n=======\n")).toBe(true);
    expect(hasMarkerLines("a\n== not a marker\n")).toBe(false);
  });
});
