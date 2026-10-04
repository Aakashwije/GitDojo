import { describe, expect, it } from "vitest";
import { HINT_LEVELS, hintIssues, namesCommand, normalizeHints } from "./levels";
import {
  createHintState,
  hintsUsed,
  nextHint,
  revealedAnswer,
  revealNext,
  visibleHints,
} from "./state";

const LADDER = [
  "Your changes currently exist only in the working tree.",
  "You need the command that moves a file into staging.",
  "Run `git add README.md`.",
];

describe("normalizeHints", () => {
  it("levels plain hints by position: concept, command, answer", () => {
    expect(normalizeHints(LADDER).map((hint) => hint.level)).toEqual([1, 2, 3]);
  });

  it("only calls the last hint the answer when it names a Git command", () => {
    expect(
      normalizeHints(["Look at the graph.", "Count the commits."]).map((h) => h.level),
    ).toEqual([1, 2]);
    expect(normalizeHints(["Try `git init`."]).map((h) => h.level)).toEqual([3]);
    expect(normalizeHints(["Look at the graph."]).map((h) => h.level)).toEqual([1]);
  });

  it("honours explicit levels and never lets the ladder go down", () => {
    const hints = normalizeHints([
      { level: 2, text: "`git restore` can do this." },
      "Think about the staging area.",
      { level: 3, text: "`git restore --staged notes.md`" },
    ]);
    expect(hints.map((hint) => hint.level)).toEqual([2, 2, 3]);
  });

  it("never infers an answer in challenges", () => {
    expect(normalizeHints(LADDER, { challenge: true }).map((h) => h.level)).toEqual([1, 2, 2]);
    expect(
      normalizeHints(["`git status` shows what is left."], { challenge: true })[0]?.level,
    ).toBe(1);
  });

  it("is empty without hints", () => {
    expect(normalizeHints(undefined)).toEqual([]);
  });
});

describe("hintIssues", () => {
  it("accepts a well-formed ladder", () => {
    expect(
      hintIssues([
        { level: 1, text: "a" },
        { level: 3, text: "Run `git init`." },
      ]),
    ).toEqual([]);
  });

  it("rejects levels going down, answers without a command, and answers in challenges", () => {
    expect(
      hintIssues([
        { level: 2, text: "b" },
        { level: 1, text: "a" },
      ]),
    ).toEqual([{ index: 1, message: "hint levels must not go down (concept → command → answer)" }]);
    expect(hintIssues([{ level: 3, text: "Just stage it." }])[0]?.message).toBe(
      "a level 3 hint must name the command, in backticks",
    );
    expect(
      hintIssues([{ level: 3, text: "Run `git init`." }], { challenge: true })[0]?.message,
    ).toBe("challenges must not give the exact command (level 3)");
  });

  it("recognises commands in backticks", () => {
    expect(namesCommand("Run `git add .` now")).toBe(true);
    expect(namesCommand("The `README.md` file")).toBe(false);
    expect(HINT_LEVELS[3].label).toBe("Answer");
  });
});

describe("hint state", () => {
  const hints = normalizeHints(LADDER);

  it("reveals hints one at a time, never past the last", () => {
    let state = createHintState("stage", hints);
    expect(state).toEqual({ objectiveId: "stage", revealedHints: 0, totalHints: 3 });
    expect(visibleHints(hints, state)).toEqual([]);
    expect(nextHint(hints, state)?.level).toBe(1);
    state = revealNext(revealNext(state));
    expect(visibleHints(hints, state).map((hint) => hint.level)).toEqual([1, 2]);
    expect(nextHint(hints, state)?.level).toBe(3);
    state = revealNext(revealNext(state));
    expect(state.revealedHints).toBe(3);
    expect(nextHint(hints, state)).toBeNull();
  });

  it("counts hints used and whether an answer was seen", () => {
    const states = {
      stage: { objectiveId: "stage", revealedHints: 2, totalHints: 3 },
      commit: { objectiveId: "commit", revealedHints: 1, totalHints: 2 },
    };
    expect(hintsUsed(states)).toBe(3);
    expect(revealedAnswer(states, () => hints)).toBe(false);
    expect(
      revealedAnswer({ ...states, stage: { ...states.stage, revealedHints: 3 } }, () => hints),
    ).toBe(true);
  });
});
