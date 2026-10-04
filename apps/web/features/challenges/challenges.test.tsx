import { CHALLENGE_CATEGORIES } from "@gitdojo/challenge-engine";
import { type ChallengeSummary } from "@gitdojo/shared-types";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useCourseProgressStore } from "@/features/course/state/use-course-progress";
import { ChallengeBrowser } from "./components/ChallengeBrowser";
import { describeMissing, nextChallenge } from "./services/challenge-navigation";

function summary(id: string, overrides: Partial<ChallengeSummary> = {}): ChallengeSummary {
  return {
    id,
    title: id.replace(/-/g, " "),
    category: "basics",
    difficulty: "beginner",
    mission: `Mission for ${id}`,
    concepts: ["commits"],
    number: 1,
    missingCommands: [],
    ...overrides,
  };
}

const CHALLENGES = [
  summary("first-commit", { number: 1 }),
  summary("wrong-branch", { number: 2, category: "branching", missingCommands: ["reset"] }),
  summary("detached-head", { number: 3, category: "branching", difficulty: "intermediate" }),
];

describe("challenge navigation", () => {
  it("skips locked challenges and wraps around", () => {
    expect(nextChallenge(CHALLENGES, "first-commit")?.id).toBe("detached-head");
    expect(nextChallenge(CHALLENGES, "detached-head")?.id).toBe("first-commit");
    expect(nextChallenge([CHALLENGES[0] as ChallengeSummary], "first-commit")).toBeNull();
  });

  it("describes missing commands in prose", () => {
    expect(describeMissing(["reset"])).toBe("git reset");
    expect(describeMissing(["reset", "stash", "reflog"])).toBe(
      "git reset, git stash and git reflog",
    );
  });
});

describe("ChallengeBrowser", () => {
  beforeEach(() => {
    useCourseProgressStore.setState({
      completedChallenges: { "first-commit": true },
      hydrated: true,
    });
  });

  it("groups challenges by category and shows solved and locked states", () => {
    render(<ChallengeBrowser challenges={CHALLENGES} categories={CHALLENGE_CATEGORIES} />);
    expect(screen.getByRole("heading", { level: 2, name: "Basics" })).toBeInTheDocument();
    const branching = screen.getByRole("region", { name: "Branching" });
    expect(within(branching).getAllByTestId("challenge-card")).toHaveLength(2);

    const states: Record<string, string | undefined> = Object.fromEntries(
      screen
        .getAllByTestId("challenge-card")
        .map((card) => [card.dataset.challenge ?? "", card.dataset.state] as const),
    );
    expect(states).toEqual({
      "first-commit": "solved",
      "wrong-branch": "locked",
      "detached-head": "open",
    });
    expect(screen.getByText(/Needs git reset/)).toBeInTheDocument();
    // Locked challenges do not count towards the total.
    expect(screen.getByTestId("challenges-solved")).toHaveTextContent("1 / 2 solved");
  });

  it("filters by difficulty", async () => {
    render(<ChallengeBrowser challenges={CHALLENGES} categories={CHALLENGE_CATEGORIES} />);
    await userEvent.click(screen.getByRole("button", { name: "Intermediate" }));
    expect(screen.getAllByTestId("challenge-card").map((card) => card.dataset.challenge)).toEqual([
      "detached-head",
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByText("No challenges at this difficulty yet.")).toBeInTheDocument();
  });
});
