import { describe, expect, it } from "vitest";
import { hasConflictMarkers, lineStats, matchLines, mergeText, splitLines } from "./text-merge";

const labels = { ours: "HEAD", theirs: "feature/login" };

describe("splitLines", () => {
  it("keeps line terminators and handles a missing final newline", () => {
    expect(splitLines("a\nb\n")).toEqual(["a\n", "b\n"]);
    expect(splitLines("a\nb")).toEqual(["a\n", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("matchLines", () => {
  it("finds the longest common subsequence", () => {
    expect(matchLines(["a", "b", "c", "d"], ["a", "c", "x", "d"])).toEqual([0, -1, 1, 3]);
  });
});

describe("lineStats", () => {
  it("counts inserted and deleted lines", () => {
    expect(lineStats("a\nb\nc\n", "a\nB\nc\nd\n")).toEqual({ insertions: 2, deletions: 1 });
    expect(lineStats("", "x\n")).toEqual({ insertions: 1, deletions: 0 });
  });
});

describe("mergeText", () => {
  const base = "one\ntwo\nthree\nfour\nfive\n";

  it("combines changes to different lines", () => {
    const ours = "ONE\ntwo\nthree\nfour\nfive\n";
    const theirs = "one\ntwo\nthree\nfour\nFIVE\n";
    expect(mergeText(base, ours, theirs, labels)).toEqual({
      text: "ONE\ntwo\nthree\nfour\nFIVE\n",
      conflicts: 0,
    });
  });

  it("takes identical changes once", () => {
    const both = "one\ntwo\nTHREE\nfour\nfive\n";
    expect(mergeText(base, both, both, labels)).toEqual({ text: both, conflicts: 0 });
  });

  it("keeps additions from both sides at different places", () => {
    const ours = "zero\none\ntwo\nthree\nfour\nfive\n";
    const theirs = "one\ntwo\nthree\nfour\nfive\nsix\n";
    expect(mergeText(base, ours, theirs, labels).text).toBe(
      "zero\none\ntwo\nthree\nfour\nfive\nsix\n",
    );
  });

  it("marks conflicting changes to the same line with Git's markers", () => {
    const ours = "one\ntwo\nthree = 30\nfour\nfive\n";
    const theirs = "one\ntwo\nthree = 60\nfour\nfive\n";
    expect(mergeText(base, ours, theirs, labels)).toEqual({
      text: [
        "one",
        "two",
        "<<<<<<< HEAD",
        "three = 30",
        "=======",
        "three = 60",
        ">>>>>>> feature/login",
        "four",
        "five",
        "",
      ].join("\n"),
      conflicts: 1,
    });
  });

  it("reports each conflicting region separately", () => {
    const ours = "ONE-a\ntwo\nthree\nfour\nFIVE-a\n";
    const theirs = "ONE-b\ntwo\nthree\nfour\nFIVE-b\n";
    expect(mergeText(base, ours, theirs, labels).conflicts).toBe(2);
  });

  it("keeps agreed lines at the edges of a conflict outside the markers", () => {
    const ours = "one\nshared\nmine\nfive\n";
    const theirs = "one\nshared\ntheirs\nfive\n";
    expect(mergeText(base, ours, theirs, labels).text).toBe(
      "one\nshared\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> feature/login\nfive\n",
    );
  });

  it("treats a file added on both sides as a whole-file conflict", () => {
    const result = mergeText("", "a\n", "b\n", labels);
    expect(result.conflicts).toBe(1);
    expect(result.text).toBe("<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feature/login\n");
  });
});

describe("hasConflictMarkers", () => {
  it("detects marker lines only", () => {
    expect(hasConflictMarkers("a\n<<<<<<< HEAD\nb\n")).toBe(true);
    expect(hasConflictMarkers("a\n=======\n")).toBe(true);
    expect(hasConflictMarkers("a <<<<<<< b\n==\n")).toBe(false);
  });
});
