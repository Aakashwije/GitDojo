import { describe, expect, it } from "vitest";
import { parseReflogSelector, parseRevision } from "./revisions";

describe("parseRevision", () => {
  it("splits a base from its ~N and ^N steps", () => {
    expect(parseRevision("HEAD")).toEqual({ base: "HEAD", steps: [] });
    expect(parseRevision("HEAD~2^2")).toEqual({
      base: "HEAD",
      steps: [
        { operator: "~", count: 2 },
        { operator: "^", count: 2 },
      ],
    });
    expect(parseRevision("main^^~")).toEqual({
      base: "main",
      steps: [
        { operator: "^", count: 1 },
        { operator: "^", count: 1 },
        { operator: "~", count: 1 },
      ],
    });
    expect(parseRevision("HEAD^0")?.steps).toEqual([{ operator: "^", count: 0 }]);
  });

  it("keeps digits that end a commit id or a name in the base", () => {
    expect(parseRevision("abc1234~2")).toEqual({
      base: "abc1234",
      steps: [{ operator: "~", count: 2 }],
    });
    expect(parseRevision("v1.0")).toEqual({ base: "v1.0", steps: [] });
    expect(parseRevision("origin/main~1")?.base).toBe("origin/main");
    expect(parseRevision("HEAD@{1}~1")).toEqual({
      base: "HEAD@{1}",
      steps: [{ operator: "~", count: 1 }],
    });
  });

  it("needs a base", () => {
    expect(parseRevision("")).toBeNull();
    expect(parseRevision("~1")).toBeNull();
    expect(parseRevision("^^")).toBeNull();
  });

  it("stays linear on input that makes a backtracking pattern quadratic", () => {
    // CodeQL's example for the regular expression this replaced: 'a^' then many '9^'.
    const hostile = `a^${"9^".repeat(100_000)}!`;
    const started = performance.now();
    expect(parseRevision(hostile)).toEqual({ base: hostile, steps: [] });
    expect(parseRevision(`a^${"9^".repeat(100_000)}`)?.steps).toHaveLength(100_001);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("parseReflogSelector", () => {
  it("reads HEAD@{n}, branch@{n} and @{n}", () => {
    expect(parseReflogSelector("HEAD@{2}")).toEqual({ ref: "HEAD", index: 2 });
    expect(parseReflogSelector("feature/login@{10}")).toEqual({ ref: "feature/login", index: 10 });
    expect(parseReflogSelector("@{1}")).toEqual({ ref: "", index: 1 });
  });

  it("refuses anything else", () => {
    for (const value of ["HEAD", "HEAD@{}", "HEAD@{x}", "HEAD@{1", "HEAD@1}", "@{-1}"]) {
      expect(parseReflogSelector(value), value).toBeNull();
    }
  });

  it("stays linear on long input", () => {
    const started = performance.now();
    expect(parseReflogSelector(`${"@{1".repeat(100_000)}x}`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(500);
  });
});
